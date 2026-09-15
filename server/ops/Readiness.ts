import { randomUUID } from 'node:crypto';
import { open, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

export interface ReadinessStatus {
  ready: boolean;
  authConfigured: boolean;
  sessionSigningConfigured: boolean;
  dataDirectoryWritable: boolean;
  protocolVersion: number;
}

export function validateProductionEnvironment(env: NodeJS.ProcessEnv): Pick<ReadinessStatus, 'authConfigured' | 'sessionSigningConfigured'> {
  const present = (value: string | undefined) => Boolean(value?.trim());
  const keyValid = (value: string | undefined) => Boolean(value && Buffer.byteLength(value) >= 32);
  return {
    authConfigured: present(env.DOUYIN_APP_ID) && present(env.DOUYIN_APP_SECRET),
    sessionSigningConfigured: keyValid(env.DOUBLEFIGHT_SESSION_SECRET)
      && (!env.DOUBLEFIGHT_SESSION_SECRET_PREVIOUS || keyValid(env.DOUBLEFIGHT_SESSION_SECRET_PREVIOUS)),
  };
}

/** Test an actual write on the mounted directory; never expose its path or contents. */
export async function dataDirectoryWritable(directory: string): Promise<boolean> {
  let probe: string | null = null;
  try {
    if (!(await stat(directory)).isDirectory()) return false;
    probe = join(directory, `.readiness-${randomUUID()}`);
    const file = await open(probe, 'wx', 0o600);
    await file.close();
    return true;
  } catch { return false; }
  finally { if (probe) await rm(probe, { force: true }).catch(() => undefined); }
}

export async function productionReadiness(env: NodeJS.ProcessEnv, directory: string, protocolVersion: number): Promise<ReadinessStatus> {
  const configuration = validateProductionEnvironment(env);
  const writable = await dataDirectoryWritable(directory);
  return {
    ready: configuration.authConfigured && configuration.sessionSigningConfigured && writable,
    ...configuration,
    dataDirectoryWritable: writable,
    protocolVersion,
  };
}
