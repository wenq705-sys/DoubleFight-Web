import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const ROOT = process.cwd();
const RUNTIME_ROOTS = ['src', 'shared', 'server', 'platform/douyin/src', 'platform/douyin/art'];
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.html', '.css', '.svg', '.md']);
const MEDIA_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp3', '.m4a', '.ogg', '.wav', '.ttf', '.otf', '.woff', '.woff2']);
const PROTECTED_MARKERS = [
  '甄嬛传', '如懿传', '延禧攻略',
  'Pokemon', 'Pokémon', '宝可梦',
  'Mario', '马里奥',
  'Disney', '迪士尼',
  'Marvel', '漫威',
  'Hello Kitty', '凯蒂猫',
  'Sanrio', '三丽鸥',
];
const HIGH_RISK_COPY = [
  '赌博', '博彩', '赌场', '下注', '现金提现',
  '稳赚', '必赚', '百分百中奖', '100%中奖',
  '官方指定', '国家认证',
];
const ALLOWED_RUNTIME_DEPENDENCIES = new Set(['three', 'ws']);

async function walk(dir) {
  const entries = await readdir(join(ROOT, dir), { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const rel = join(dir, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) output.push(...await walk(rel));
    else output.push(rel);
  }
  return output;
}

const files = (await Promise.all(RUNTIME_ROOTS.map(walk))).flat();
const issues = [];
const media = [];
const externalMedia = [];

for (const file of files) {
  const ext = extname(file).toLowerCase();
  if (MEDIA_EXTENSIONS.has(ext)) media.push(file);
  if (!TEXT_EXTENSIONS.has(ext)) continue;
  const source = await readFile(join(ROOT, file), 'utf8');

  for (const marker of PROTECTED_MARKERS) {
    if (source.toLowerCase().includes(marker.toLowerCase())) {
      issues.push(`${file}: protected/franchise marker "${marker}"`);
    }
  }
  for (const marker of HIGH_RISK_COPY) {
    if (source.includes(marker)) {
      issues.push(`${file}: high-risk release wording "${marker}"`);
    }
  }

  const matches = source.match(/https?:\/\/[^\s'"<>]+\.(?:png|jpe?g|webp|gif|mp3|m4a|ogg|wav|ttf|otf|woff2?)(?:\?[^\s'"<>]*)?/gi) ?? [];
  for (const match of matches) externalMedia.push(`${file}: ${match}`);
}

const packageJson = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
const runtimeDependencies = Object.keys(packageJson.dependencies ?? {});
for (const dependency of runtimeDependencies) {
  if (!ALLOWED_RUNTIME_DEPENDENCIES.has(dependency)) {
    issues.push(`package.json: unreviewed runtime dependency "${dependency}"`);
  }
}

const themeEconomySource = await readFile(join(ROOT, 'shared/game/themeEconomy.ts'), 'utf8');
const multiAdUnlocks = [...themeEconomySource.matchAll(/adViewsRequired:\s*(\d+)/g)]
  .map(match => Number(match[1]))
  .filter(value => Number.isFinite(value) && value > 1);
if (multiAdUnlocks.length > 0) {
  issues.push('shared/game/themeEconomy.ts: a single theme reward requires multiple rewarded-video views');
}

const generatedAudioSource = await readFile(join(ROOT, 'scripts/build-douyin.mjs'), 'utf8');
if (!generatedAudioSource.includes('renderMusic(plan)') || !generatedAudioSource.includes('pcmWav(')) {
  issues.push('scripts/build-douyin.mjs: release music is not proven to be generated in-repo');
}

const unreviewedMedia = media.filter(file =>
  !file.startsWith('platform/douyin/art/') ||
  !file.endsWith('.svg')
);
for (const file of unreviewedMedia) issues.push(`${file}: committed binary/media asset requires provenance review`);
for (const finding of externalMedia) issues.push(`${finding}: remote media URL requires rights/provenance review`);

if (issues.length > 0) {
  console.error('Release compliance audit FAILED:');
  for (const issue of issues) console.error(` - ${issue}`);
  process.exit(1);
}

console.log('Release compliance audit PASS');
console.log(`Scanned ${files.length} runtime files.`);
console.log('No known franchise markers, gambling/cash-out wording, remote media assets, bundled fonts, or unreviewed runtime dependencies were found.');
console.log(`Reviewed in-repo art assets: ${media.length === 0 ? 'none' : media.join(', ')}.`);
console.log('Theme music/SFX are generated from repository code during the Douyin build; no third-party audio file is bundled from source.');
console.log('This static audit is a release gate, not a substitute for platform/legal review of the final rendered experience.');
