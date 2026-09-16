import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { DOUYIN_PRODUCT_CONFIG } from '../platform/douyin/src/config';

type ProjectConfig = { appid?: unknown; setting?: { urlCheck?: unknown } };
type ProductConfig = { appId: string; apiUrl: string; socketUrl: string; ads: { banner: string; rewarded: string; interstitial: string } };

export interface ReleaseManifest {
  product: ProductConfig;
  development: ProjectConfig;
  release: ProjectConfig;
  built: ProjectConfig;
  gameJson: { deviceOrientation?: unknown };
  bundle: string;
  audio: readonly { name: string; bytes: number; wave: boolean }[];
  missingFiles: readonly string[];
  privateConfigPresent: boolean;
  environment?: NodeJS.ProcessEnv;
}

/** Returns only categories, never a secret or a fragment of the bundle. */
export function inspectDouyinRelease(manifest: ReleaseManifest): string[] {
  const errors: string[] = [];
  const { product, development, release, built } = manifest;
  if (!product.appId || !/^tt[A-Za-z0-9]+$/.test(product.appId)
    || development.appid !== product.appId || release.appid !== product.appId || built.appid !== product.appId) {
    errors.push('appid_mismatch');
  }
  if (development.setting?.urlCheck !== false) errors.push('development_domain_setting');
  if (release.setting?.urlCheck !== true || built.setting?.urlCheck !== true || manifest.privateConfigPresent) {
    errors.push('release_domain_setting');
  }
  if (!secureUrl(product.apiUrl, 'https:')) errors.push('api_not_https');
  if (!secureUrl(product.socketUrl, 'wss:')) errors.push('socket_not_wss');
  const adUnits = [product.ads.banner, product.ads.rewarded, product.ads.interstitial];
  if (adUnits.some(id => !id?.trim()) || new Set(adUnits).size !== adUnits.length) errors.push('ad_units_invalid');
  if (manifest.gameJson.deviceOrientation !== 'portrait') errors.push('orientation_invalid');
  if (manifest.missingFiles.length) errors.push('release_files_missing');
  const requiredAudio = ['move.wav', 'merge.wav', 'merge-high.wav', 'skill.wav', 'impact.wav', 'victory.wav', 'defeat.wav'];
  if (requiredAudio.some(name => !manifest.audio.some(asset => asset.name === name && asset.wave && asset.bytes > 44))) {
    errors.push('generated_audio_missing');
  }
  if (/\b(?:DOUYIN_APP_SECRET|DOUBLEFIGHT_SESSION_SECRET(?:_PREVIOUS)?|session_key|anonymous_openid|openid|unionid)\b/i.test(manifest.bundle)
    || /Bearer [A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(manifest.bundle)) {
    errors.push('server_secret_marker_bundled');
  }
  for (const key of ['DOUYIN_APP_SECRET', 'DOUBLEFIGHT_SESSION_SECRET', 'DOUBLEFIGHT_SESSION_SECRET_PREVIOUS'] as const) {
    const value = manifest.environment?.[key];
    if (value && value.length >= 16 && manifest.bundle.includes(value)) errors.push('server_secret_value_bundled');
  }
  if (/\[M2\.(?:9|10)(?:\.|\s)|\b(?:DouyinSocketProbe|SPIKE_ENDPOINT)\b/.test(manifest.bundle)) {
    errors.push('development_probe_bundled');
  }
  return [...new Set(errors)];
}

function secureUrl(value: string, protocol: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === protocol && Boolean(url.hostname) && !url.username && !url.password
      && !/^(?:localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(url.hostname)
      && !url.search && !url.hash;
  } catch { return false; }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export async function readDouyinReleaseManifest(root = 'platform/douyin'): Promise<ReleaseManifest> {
  const releaseRoot = join(root, 'dist-release');
  const required = ['game.js', 'game.json', 'project.config.json'];
  const missingFiles: string[] = [];
  for (const name of required) {
    try { if (!(await stat(join(releaseRoot, name))).isFile()) missingFiles.push(name); }
    catch { missingFiles.push(name); }
  }
  let privateConfigPresent = false;
  try { privateConfigPresent = (await stat(join(releaseRoot, 'project.private.config.json'))).isFile(); }
  catch { /* release output must not contain the IDE's private override */ }
  const audio: Array<{ name: string; bytes: number; wave: boolean }> = [];
  try {
    for (const name of await readdir(join(releaseRoot, 'audio'))) {
      if (!name.endsWith('.wav')) continue;
      const data = await readFile(join(releaseRoot, 'audio', name));
      audio.push({ name, bytes: data.length, wave: data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WAVE' });
    }
  } catch { /* reported as missing audio */ }
  return {
    product: DOUYIN_PRODUCT_CONFIG,
    development: await readJson(join(root, 'project.config.json')),
    release: await readJson(join(root, 'project.release.config.json')),
    built: missingFiles.includes('project.config.json') ? {} : await readJson(join(releaseRoot, 'project.config.json')),
    gameJson: missingFiles.includes('game.json') ? {} : await readJson(join(releaseRoot, 'game.json')),
    bundle: missingFiles.includes('game.js') ? '' : await readFile(join(releaseRoot, 'game.js'), 'utf8'),
    audio,
    missingFiles,
    privateConfigPresent,
    environment: process.env,
  };
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/scripts/preflight-douyin.ts')) {
  try {
    const errors = inspectDouyinRelease(await readDouyinReleaseManifest());
    if (errors.length) {
      console.error(`Douyin release preflight FAIL: ${errors.join(', ')}`);
      process.exitCode = 1;
    } else console.log('Douyin release preflight PASS');
  } catch {
    console.error('Douyin release preflight FAIL: manifest_unreadable');
    process.exitCode = 1;
  }
}
