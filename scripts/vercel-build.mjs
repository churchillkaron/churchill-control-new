import { spawnSync } from "node:child_process";
import process from "node:process";

const marker = "[code-production-proof]";
const message = String(process.env.VERCEL_GIT_COMMIT_MESSAGE || "").toLowerCase();
const production = String(process.env.VERCEL_ENV || "").toLowerCase() === "production";

if (production && message.includes(marker)) {
  const proof = spawnSync(process.execPath, ["scripts/run-avantiqo-code-vercel-production-inference-proof.mjs"], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (proof.status !== 0) process.exit(proof.status || 1);
}

const build = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  cwd: process.cwd(),
  env: process.env,
  encoding: "utf8",
  stdio: "inherit",
});
process.exit(build.status || 0);
