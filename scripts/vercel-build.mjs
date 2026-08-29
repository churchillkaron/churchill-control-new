import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const marker = "[code-production-proof]";
const message = String(process.env.VERCEL_GIT_COMMIT_MESSAGE || "").toLowerCase();
const production = String(process.env.VERCEL_ENV || "").toLowerCase() === "production";

if (production && !String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()) {
  console.error("AVANTIQO_PRODUCTION_ENV_PREFLIGHT_FAILED missing=SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

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
if (build.status !== 0) process.exit(build.status || 1);

if (production) {
  const clientChunksRoot = join(process.cwd(), ".next", "static", "chunks");
  const forbiddenClientTokens = ["SUPABASE_SERVICE_ROLE_KEY"];
  const leakedFiles = [];

  function scanDirectory(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        scanDirectory(absolutePath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
      const source = readFileSync(absolutePath, "utf8");
      if (forbiddenClientTokens.some((token) => source.includes(token))) {
        leakedFiles.push(absolutePath.replace(`${process.cwd()}/`, ""));
      }
    }
  }

  scanDirectory(clientChunksRoot);

  if (leakedFiles.length > 0) {
    console.error(
      `AVANTIQO_CLIENT_BUNDLE_PRIVILEGED_ENV_LEAK_FAILED files=${leakedFiles.join(",")}`,
    );
    process.exit(1);
  }

  console.log("AVANTIQO_CLIENT_BUNDLE_PRIVILEGED_ENV_LEAK_CHECK=PASS");
}

process.exit(0);
