import { readFile } from 'node:fs/promises';
import { validateProductionEnvironment } from '../server/ops/Readiness';

const status = validateProductionEnvironment(process.env);
let expectedAppId: string | null = null;
try {
  const release = JSON.parse(await readFile('platform/douyin/project.release.config.json', 'utf8')) as { appid?: string };
  expectedAppId = release.appid ?? null;
} catch { /* fail closed */ }
const appIdMatchesRelease = Boolean(expectedAppId && process.env.DOUYIN_APP_ID === expectedAppId);
console.log(JSON.stringify({ ...status, appIdMatchesRelease }));
if (!status.authConfigured || !status.sessionSigningConfigured || !appIdMatchesRelease) process.exitCode = 1;
