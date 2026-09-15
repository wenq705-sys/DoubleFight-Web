import { describe, expect, it } from 'vitest';
import { inspectDouyinRelease, readDouyinReleaseManifest, type ReleaseManifest } from '../scripts/preflight-douyin';

const product = {
  appId: 'tttestappid123', apiUrl: 'https://game.example', socketUrl: 'wss://game.example/ws',
  ads: { banner: 'banner-unit', rewarded: 'rewarded-unit', interstitial: 'interstitial-unit' },
};

function valid(): ReleaseManifest {
  return {
    product, development: { appid: product.appId, setting: { urlCheck: false } },
    release: { appid: product.appId, setting: { urlCheck: true } },
    built: { appid: product.appId, setting: { urlCheck: true } },
    gameJson: { deviceOrientation: 'portrait' }, bundle: 'safe game bundle',
    audio: ['move.wav', 'merge.wav', 'merge-high.wav', 'skill.wav', 'impact.wav', 'victory.wav', 'defeat.wav']
      .map(name => ({ name, bytes: 100, wave: true })),
    missingFiles: [], privateConfigPresent: false,
  };
}

describe('Douyin release preflight', () => {
  it('accepts the generated release with formal domain checks and audio', async () => {
    expect(inspectDouyinRelease(valid())).toEqual([]);
    expect(inspectDouyinRelease(await readDouyinReleaseManifest())).toEqual([]);
  });

  it('fails on domain bypass, app ID drift, insecure URLs and ad configuration', () => {
    const manifest = valid();
    manifest.built.setting!.urlCheck = false;
    manifest.release.appid = 'ttwrong';
    manifest.product = { ...product, apiUrl: 'http://game.example', socketUrl: 'ws://game.example/ws',
      ads: { banner: 'same', rewarded: 'same', interstitial: '' } };
    expect(inspectDouyinRelease(manifest)).toEqual(expect.arrayContaining([
      'appid_mismatch', 'release_domain_setting', 'api_not_https', 'socket_not_wss', 'ad_units_invalid',
    ]));
  });

  it('rejects missing game/audio assets, an IDE private override and probe labels', () => {
    const manifest = valid();
    manifest.missingFiles = ['game.js'];
    manifest.audio = [];
    manifest.privateConfigPresent = true;
    manifest.bundle = '[M2.9 socket] hello';
    expect(inspectDouyinRelease(manifest)).toEqual(expect.arrayContaining([
      'release_files_missing', 'generated_audio_missing', 'release_domain_setting', 'development_probe_bundled',
    ]));
  });

  it('rejects server-only markers or values without echoing their contents', () => {
    const manifest = valid();
    manifest.bundle = 'DOUYIN_APP_SECRET';
    expect(inspectDouyinRelease(manifest)).toContain('server_secret_marker_bundled');
    manifest.bundle = 'mock-only-test-secret-value-123456';
    manifest.environment = { DOUYIN_APP_SECRET: manifest.bundle };
    const errors = inspectDouyinRelease(manifest);
    expect(errors).toContain('server_secret_value_bundled');
    expect(JSON.stringify(errors)).not.toContain(manifest.bundle);
  });
});
