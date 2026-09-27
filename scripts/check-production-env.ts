import { validateProductionEnvironment } from '../server/ops/Readiness';

const status = validateProductionEnvironment(process.env);
// Operator supplies the independently verified RC App ID; no client source is read.
const expectedAppId = process.env.DOUBLEFIGHT_EXPECTED_APP_ID?.trim();
const appIdMatchesRelease = Boolean(expectedAppId && process.env.DOUYIN_APP_ID === expectedAppId);
console.log(JSON.stringify({ ...status, appIdMatchesRelease }));
if (!status.authConfigured || !status.sessionSigningConfigured || !appIdMatchesRelease) process.exitCode = 1;
