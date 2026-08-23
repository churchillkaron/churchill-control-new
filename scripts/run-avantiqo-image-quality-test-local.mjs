import fs from "node:fs";
import { spawnSync } from "node:child_process";

const FIXTURE_PATH =
  process.env.AVANTIQO_MEDIA_CERTIFICATION_FIXTURES ||
  "/tmp/avantiqo-media-certification-fixtures.json";

function text(value) {
  return String(value ?? "").trim();
}

function runNode(args, env = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

if (!fs.existsSync(".env.local")) {
  throw new Error("AVANTIQO_IMAGE_QUALITY_TEST_ENV_LOCAL_REQUIRED");
}

console.log("AVANTIQO_IMAGE_QUALITY_STAGE=FIXTURE");
runNode(
  ["--env-file=.env.local", "scripts/prepare-avantiqo-owned-media-certification-fixtures.mjs"],
  { AVANTIQO_MEDIA_CERTIFICATION_FIXTURE_SCOPE: "CORE_IMAGE_CINEMA" },
);

const fixtures = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
if (
  fixtures?.contract !== "AVANTIQO_OWNED_MEDIA_CERTIFICATION_FIXTURES_V1" ||
  fixtures?.fixture_scope !== "CORE_IMAGE_CINEMA" ||
  fixtures?.source_scope !== "BENCHMARK_ONLY"
) {
  throw new Error("AVANTIQO_IMAGE_QUALITY_FIXTURE_CONTRACT_INVALID");
}

const target = fixtures?.uploads?.["ai.image.generate"];
if (!text(target?.signed_url) || !text(target?.storage_reference)) {
  throw new Error("AVANTIQO_IMAGE_QUALITY_OUTPUT_TARGET_INVALID");
}

console.log("AVANTIQO_IMAGE_QUALITY_STAGE=GENERATION");
runNode(
  ["--env-file=.env.local", "scripts/benchmark-avantiqo-image.mjs"],
  {
    AVANTIQO_IMAGE_BENCHMARK_RUNS: "1",
    AVANTIQO_IMAGE_BENCHMARK_UPLOAD_URL: target.signed_url,
    AVANTIQO_IMAGE_BENCHMARK_STORAGE_REFERENCE: target.storage_reference,
  },
);

console.log("AVANTIQO_IMAGE_QUALITY_TEST_COMPLETE=YES");
