import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";

const marker = "[code-production-proof]";
const message = String(process.env.VERCEL_GIT_COMMIT_MESSAGE || "").toLowerCase();
const production = String(process.env.VERCEL_ENV || "").toLowerCase() === "production";

if (production && !String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()) {
  console.error("AVANTIQO_PRODUCTION_ENV_PREFLIGHT_FAILED missing=SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (production && message.includes(marker)) {
  const proof = spawnSync(process.execPath, ["scripts/run-avantiqo-code-vercel-production-proof-v4.mjs"], {
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
  const diagnostics = [];

  function scanDirectory(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        scanDirectory(absolutePath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
      const source = readFileSync(absolutePath, "utf8");
      for (const token of forbiddenClientTokens) {
        const index = source.indexOf(token);
        if (index === -1) continue;
        const relativePath = absolutePath.replace(`${process.cwd()}/`, "");
        leakedFiles.push(relativePath);
        const start = Math.max(0, index - 220);
        const end = Math.min(source.length, index + token.length + 220);
        const context = source
          .slice(start, end)
          .replace(/\s+/g, " ")
          .replace(/[^\x20-\x7E]/g, "?");
        diagnostics.push({ file: relativePath, token, context });
      }
    }
  }

  function reportManifestReferences(leakedFile) {
    const chunkName = basename(leakedFile);
    for (const manifestName of [
      "app-build-manifest.json",
      "build-manifest.json",
      "react-loadable-manifest.json",
    ]) {
      const manifestPath = join(process.cwd(), ".next", manifestName);
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      const references = [];

      function walk(value, path = []) {
        if (typeof value === "string") {
          if (value.includes(chunkName)) references.push(path.join("."));
          return;
        }
        if (Array.isArray(value)) {
          value.forEach((item, index) => walk(item, [...path, String(index)]));
          return;
        }
        if (value && typeof value === "object") {
          for (const [key, item] of Object.entries(value)) walk(item, [...path, key]);
        }
      }

      walk(manifest);
      if (references.length > 0) {
        console.error(
          `AVANTIQO_CLIENT_BUNDLE_MANIFEST_REFERENCE manifest=${manifestName} chunk=${chunkName} refs=${references.slice(0, 80).join(",")}`,
        );
      }
    }
  }

  scanDirectory(clientChunksRoot);

  if (leakedFiles.length > 0) {
    for (const diagnostic of diagnostics) {
      console.error(
        `AVANTIQO_CLIENT_BUNDLE_PRIVILEGED_ENV_DIAGNOSTIC file=${diagnostic.file} token=${diagnostic.token} context=${diagnostic.context}`,
      );
    }
    for (const leakedFile of [...new Set(leakedFiles)]) reportManifestReferences(leakedFile);
    console.error(
      `AVANTIQO_CLIENT_BUNDLE_PRIVILEGED_ENV_LEAK_FAILED files=${[...new Set(leakedFiles)].join(",")}`,
    );
    process.exit(1);
  }

  console.log("AVANTIQO_CLIENT_BUNDLE_PRIVILEGED_ENV_LEAK_CHECK=PASS");
}

process.exit(0);
