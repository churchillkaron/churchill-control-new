import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

export function loadAvantiqoEnv({ cwd = process.cwd() } = {}) {
  return loadEnvConfig(cwd);
}
