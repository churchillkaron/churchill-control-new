import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

function resolveEnvCwd(cwd, envFile) {
  const explicitEnvFile = String(envFile || "").trim();
  if (!explicitEnvFile) return cwd;

  const resolvedEnvFile = path.resolve(explicitEnvFile);
  if (!existsSync(resolvedEnvFile)) {
    throw new Error("AVANTIQO_ENV_FILE_NOT_FOUND");
  }
  return path.dirname(resolvedEnvFile);
}

export function loadAvantiqoEnv({
  cwd = process.cwd(),
  envFile = process.env.AVANTIQO_ENV_FILE,
} = {}) {
  return loadEnvConfig(resolveEnvCwd(cwd, envFile));
}
