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
  throw new Error("AVANTIQO_MEDIA_CORE_ENV_LOCAL_REQUIRED");
}

console.log("AVANTIQO_MEDIA_CORE_STAGE=PREFLIGHT");
runNode(["--env-file=.env.local", "scripts/preflight-avantiqo-owned-media-local.mjs"]);

console.log("AVANTIQO_MEDIA_CORE_STAGE=FIXTURES");
runNode(
  ["--env-file=.env.local", "scripts/prepare-avantiqo-owned-media-certification-fixtures.mjs"],
  {
    AVANTIQO_MEDIA_CERTIFICATION_FIXTURE_SCOPE: "CORE_IMAGE_CINEMA",
  },
);

const fixtures = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
if (
  fixtures?.contract !== "AVANTIQO_OWNED_MEDIA_CERTIFICATION_FIXTURES_V1" ||
  fixtures?.fixture_scope !== "CORE_IMAGE_CINEMA" ||
  fixtures?.source_scope !== "BENCHMARK_ONLY"
) {
  throw new Error("AVANTIQO_MEDIA_CORE_FIXTURE_CONTRACT_INVALID");
}

const imageTarget = fixtures?.uploads?.["ai.image.generate"];
const t2vTarget = fixtures?.uploads?.["ai.video.generate"];
const i2vTarget = fixtures?.uploads?.["ai.video.image_to_video"];
const i2vSource = text(fixtures?.video_first_frame_url);

for (const [label, target] of Object.entries({ imageTarget, t2vTarget, i2vTarget })) {
  if (!text(target?.signed_url) || !text(target?.storage_reference)) {
    throw new Error(`AVANTIQO_MEDIA_CORE_OUTPUT_TARGET_INVALID:${label}`);
  }
}
if (!i2vSource) {
  throw new Error("AVANTIQO_MEDIA_CORE_I2V_SOURCE_REQUIRED");
}

console.log("AVANTIQO_MEDIA_CORE_STAGE=IMAGE_GENERATION");
runNode(
  ["--env-file=.env.local", "scripts/benchmark-avantiqo-image.mjs"],
  {
    AVANTIQO_IMAGE_BENCHMARK_UPLOAD_URL: imageTarget.signed_url,
    AVANTIQO_IMAGE_BENCHMARK_STORAGE_REFERENCE: imageTarget.storage_reference,
  },
);

console.log("AVANTIQO_MEDIA_CORE_STAGE=CINEMA_GENERATION");
runNode(
  ["--env-file=.env.local", "scripts/benchmark-avantiqo-cinema.mjs"],
  {
    AVANTIQO_CINEMA_BENCHMARK_T2V_UPLOAD_URL: t2vTarget.signed_url,
    AVANTIQO_CINEMA_BENCHMARK_T2V_STORAGE_REFERENCE: t2vTarget.storage_reference,
    AVANTIQO_CINEMA_BENCHMARK_I2V_UPLOAD_URL: i2vTarget.signed_url,
    AVANTIQO_CINEMA_BENCHMARK_I2V_STORAGE_REFERENCE: i2vTarget.storage_reference,
    AVANTIQO_CINEMA_BENCHMARK_I2V_SOURCE_URL: i2vSource,
  },
);

const imageReportPath =
  process.env.AVANTIQO_IMAGE_BENCHMARK_OUTPUT ||
  "/tmp/avantiqo-image-certification-benchmark.json";
const cinemaReportPath =
  process.env.AVANTIQO_CINEMA_BENCHMARK_OUTPUT ||
  "/tmp/avantiqo-cinema-certification-benchmark.json";
const imageReport = JSON.parse(fs.readFileSync(imageReportPath, "utf8"));
const cinemaReport = JSON.parse(fs.readFileSync(cinemaReportPath, "utf8"));

const mechanicalPass =
  imageReport?.summary?.passed === true &&
  cinemaReport?.summary?.passed === true;

console.log(
  JSON.stringify(
    {
      success: mechanicalPass,
      contract: "AVANTIQO_OWNED_MEDIA_CORE_LOCAL_CERTIFICATION_V1",
      image_generation_passed: imageReport?.summary?.passed === true,
      cinema_generation_passed: cinemaReport?.summary?.passed === true,
      cinema_t2v_passed: cinemaReport?.summary?.t2v_passed === true,
      cinema_i2v_passed: cinemaReport?.summary?.i2v_passed === true,
      image_report: imageReportPath,
      cinema_report: cinemaReportPath,
      fixtures: FIXTURE_PATH,
      quality_review_required: true,
      economics_measurement_required: true,
      production_certified: false,
      production_activation_performed: false,
      production_deploy_performed: false,
    },
    null,
    2,
  ),
);

if (!mechanicalPass) process.exit(2);
