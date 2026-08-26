import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const V13 = "scripts/cache-avantiqo-video-wan22-i2v-a14b-image-pattern-v13-local.mjs";
const SAFE_LEASE_V2 = "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_I2V_A14B_SAFE_LEASE_CACHE_V16";
const APPROVAL_ENV = "AVANTIQO_VIDEO_WAN22_I2V_SAFE_LEASE_CACHE_APPROVED";
const LEASE_TTL_MS = 1_800_000;
const text = (value) => String(value ?? "").trim();
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_ANCHOR_COUNT:${count}`);
  return source.replace(before, after);
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_I2V_V16_NODE24_REQUIRED:${process.version}`);
}

const apply = process.argv.includes("--apply");
if (!apply) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "PLAN",
    safe_lease: {
      controller: SAFE_LEASE_V2,
      contract: "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
      lane: "cinema",
      ttl_ms: LEASE_TTL_MS,
      controller_owns_workers_max: true,
      direct_workers_max_write: false,
      runpod_jobs_outside_lease: 0,
      parallel_leases_allowed_by_policy: true,
    },
    cache: {
      target_model: "Wan-AI/Wan2.2-I2V-A14B-Diffusers",
      runtime_probe_before_cache: true,
      partial_snapshot_certified: false,
      rerun_may_resume_partial_snapshot: true,
      endpoint_execution_timeout_mutation: false,
    },
    image: {
      endpoint_mutation: false,
      shared_volume_binding_preserved: true,
      concurrent_active_image_job_blocks_video_cache: true,
    },
    safety: {
      video_generation: false,
      inference: false,
      production_web_deploy: false,
      pricing_activation: false,
      secrets_printed: false,
    },
    next_action: "APPLY_THROUGH_CINEMA_SAFE_LEASE_V2",
  }, null, 2));
  console.log("AVANTIQO_VIDEO_WAN22_I2V_SAFE_LEASE_CACHE_V16_APPLIED=false");
  process.exit(0);
}

if (!approved(process.env[APPROVAL_ENV])) {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

let wrapper = await readFile(V13, "utf8");
const injectionAnchor = 'const dir = await mkdtemp(join(tmpdir(), "avantiqo-video-i2v-v13-"));';
const injection = String.raw`
// V16: safe-lease adaptation. The V2 controller owns Cinema workersMax for the entire child lifetime.
function replaceBetweenV16(value, start, end, replacement, label) {
  const startIndex = value.indexOf(start);
  if (startIndex < 0 || value.indexOf(start, startIndex + 1) >= 0) throw new Error(label + "_START_ANCHOR");
  const endIndex = value.indexOf(end, startIndex + start.length);
  if (endIndex < 0) throw new Error(label + "_END_ANCHOR");
  return value.slice(0, startIndex) + replacement + value.slice(endIndex);
}
source = replaceExactly(
  source,
  'const CACHE_EXECUTION_TIMEOUT_MS = Math.max(\n  2 * 60 * 60 * 1000,\n  Number(process.env.AVANTIQO_VIDEO_WAN22_CACHE_EXECUTION_TIMEOUT_MS || 2 * 60 * 60 * 1000),\n);',
  'const CACHE_EXECUTION_TIMEOUT_MS = 30 * 60 * 1000;',
  1,
  "AVANTIQO_VIDEO_I2V_V16_LEASE_BOUNDED_EXECUTION_TIMEOUT",
);
source = replaceExactly(source, 'safe.workers_max !== 1 ||', '![0, 1].includes(safe.workers_max) ||', 1, "AVANTIQO_VIDEO_I2V_V16_IMAGE_POLICY_COMPAT");
source = replaceExactly(
  source,
  'const imageTemplate = resolveTemplate(initial.templates, text(image.templateId || image.template?.id), "AVANTIQO_VIDEO_T2V_CACHE_IMAGE");',
  'if (apply) {\n  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES" ||\n      text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== "AVANTIQO_RUNPOD_SAFE_LEASE_V2" ||\n      text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== "cinema" ||\n      text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID) !== text(cinema.id)) {\n    throw new Error("AVANTIQO_VIDEO_I2V_V16_VALID_CINEMA_SAFE_LEASE_REQUIRED");\n  }\n}\nconst imageTemplate = resolveTemplate(initial.templates, text(image.templateId || image.template?.id), "AVANTIQO_VIDEO_T2V_CACHE_IMAGE");',
  1,
  "AVANTIQO_VIDEO_I2V_V16_LEASE_GUARD",
);
source = replaceExactly(
  source,
  'if (finite(cinema.workersMin) !== 0 || finite(cinema.workersMax) !== 0) {',
  'if (finite(cinema.workersMin) !== 0 || finite(cinema.workersMax) !== (apply ? 1 : 0)) {',
  1,
  "AVANTIQO_VIDEO_I2V_V16_INITIAL_LEASE_STATE",
);
source = replaceExactly(
  source,
  'if (!Number.isFinite(originalTimeoutMs) || originalTimeoutMs <= 0) {',
  'if (!Number.isFinite(originalTimeoutMs) || originalTimeoutMs < 30 * 60 * 1000) {',
  1,
  "AVANTIQO_VIDEO_I2V_V16_TIMEOUT_BASELINE",
);
source = replaceExactly(
  source,
  'const initialHealth = healthSummary(await queueRequest(text(cinema.id), "/health", queueCredential.key));\nassertCinemaFullyQuiescent(initialHealth, "AVANTIQO_VIDEO_T2V_CACHE_INITIAL_CINEMA");',
  'const imageQueueCredential = await selectQueueCredential(text(image.id), [\n  text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY)\n    ? { source: "RUNPOD_AVANTIQO_IMAGE_API_KEY", key: text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) }\n    : null,\n  text(process.env.RUNPOD_API_KEY)\n    ? { source: "RUNPOD_API_KEY", key: text(process.env.RUNPOD_API_KEY) }\n    : null,\n  { source: "RUNPOD_MANAGEMENT_API_KEY", key: managementKey },\n]);\nconst initialImageHealth = healthSummary(await queueRequest(text(image.id), "/health", imageQueueCredential.key));\nassertNoActiveJobs(initialImageHealth, "AVANTIQO_VIDEO_I2V_V16_INITIAL_IMAGE");\nconst initialHealth = healthSummary(await queueRequest(text(cinema.id), "/health", queueCredential.key));\nassertNoActiveJobs(initialHealth, "AVANTIQO_VIDEO_I2V_V16_INITIAL_CINEMA");',
  1,
  "AVANTIQO_VIDEO_I2V_V16_SHARED_VOLUME_QUIESCENCE",
);
source = replaceBetweenV16(
  source,
  '  const health = healthSummary(await queueRequest(text(freshCinema.id), "/health", queueCredential.key));',
  '  return { freshCinema, health };',
  '  const imageHealth = healthSummary(await queueRequest(text(freshImage.id), "/health", imageQueueCredential.key));\n  assertNoActiveJobs(imageHealth, "AVANTIQO_VIDEO_I2V_V16_REVALIDATE_IMAGE");\n  const health = healthSummary(await queueRequest(text(freshCinema.id), "/health", queueCredential.key));\n  assertNoActiveJobs(health, "AVANTIQO_VIDEO_I2V_V16_REVALIDATE_CINEMA");\n',
  "AVANTIQO_VIDEO_I2V_V16_REVALIDATE_IMAGE_QUIESCENCE",
);
source = replaceBetweenV16(
  source,
  '  try {\n    const current = await waitForEndpoint(endpointId, managementKey, () => true, "AVANTIQO_VIDEO_T2V_CACHE_RESTORE_READ", 15_000);',
  '  if (timeoutChangedByThisScript) {',
  '  console.log("AVANTIQO_VIDEO_I2V_V16_WORKER_RELEASE_DEFERRED_TO_SAFE_LEASE_CONTROLLER=true");\n\n',
  "AVANTIQO_VIDEO_I2V_V16_REMOVE_DIRECT_WORKER_RELEASE",
);
source = replaceExactly(
  source,
  'if (finite(preTimeout.freshCinema.workersMin) !== 0 || finite(preTimeout.freshCinema.workersMax) !== 0) {',
  'if (finite(preTimeout.freshCinema.workersMin) !== 0 || finite(preTimeout.freshCinema.workersMax) !== 1) {',
  1,
  "AVANTIQO_VIDEO_I2V_V16_PRE_TIMEOUT_LEASE_STATE",
);
source = replaceExactly(
  source,
  'if (finite(preEnable.freshCinema.workersMin) !== 0 || finite(preEnable.freshCinema.workersMax) !== 0) {',
  'if (finite(preEnable.freshCinema.workersMin) !== 0 || finite(preEnable.freshCinema.workersMax) !== 1) {',
  1,
  "AVANTIQO_VIDEO_I2V_V16_PRE_RUN_LEASE_STATE",
);
{
  const marker = '    body: { workersMax: 1 },';
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0 || source.indexOf(marker, markerIndex + 1) >= 0) throw new Error("AVANTIQO_VIDEO_I2V_V16_WORKER_ENABLE_MARKER_COUNT");
  const startIndex = source.lastIndexOf('  await rest(', markerIndex);
  const endMarker = '  console.log("AVANTIQO_VIDEO_T2V_CACHE_TEMPORARY_WORKERS_MAX=1");';
  const endIndex = source.indexOf(endMarker, markerIndex);
  if (startIndex < 0 || endIndex < 0) throw new Error("AVANTIQO_VIDEO_I2V_V16_WORKER_ENABLE_BLOCK_ANCHOR");
  source = source.slice(0, startIndex) + '  console.log("AVANTIQO_VIDEO_I2V_V16_SAFE_LEASE_CONTROLLER_OWNS_WORKERS_MAX=true");' + source.slice(endIndex + endMarker.length);
}
source = replaceExactly(
  source,
  'if (finite(finalCinema.workersMin) !== 0 || finite(finalCinema.workersMax) !== 0) {',
  'if (finite(finalCinema.workersMin) !== 0 || finite(finalCinema.workersMax) !== 1) {',
  1,
  "AVANTIQO_VIDEO_I2V_V16_FINAL_LEASE_STATE",
);
source = replaceExactly(
  source,
  'assertCinemaFullyQuiescent(finalHealth, "AVANTIQO_VIDEO_T2V_CACHE_FINAL_CINEMA");',
  'assertNoActiveJobs(finalHealth, "AVANTIQO_VIDEO_I2V_V16_FINAL_CINEMA");',
  1,
  "AVANTIQO_VIDEO_I2V_V16_FINAL_HEALTH",
);
source = replaceExactly(
  source,
  'console.log("AVANTIQO_VIDEO_WAN22_I2V_IMAGE_PATTERN_CACHE_V13_APPLIED=true");',
  'console.log("AVANTIQO_VIDEO_WAN22_I2V_SAFE_LEASE_CACHE_V16_CHILD_APPLIED=true");',
  1,
  "AVANTIQO_VIDEO_I2V_V16_CHILD_SUCCESS_LINE",
);
`;
wrapper = replaceOnce(wrapper, injectionAnchor, `${injection}\n${injectionAnchor}`, "AVANTIQO_VIDEO_I2V_V16_INJECTION");
wrapper = wrapper.replace(
  'cinema_workers_max_temporary: 1,\n      cinema_workers_max_final: 0,',
  'cinema_workers_max_owned_by_safe_lease_v2: true,\n      cinema_workers_max_child_mutation: false,',
);
wrapper = wrapper.replace('timeout_only_temporary: true,', 'endpoint_execution_timeout_mutation: false,');

const dir = await mkdtemp(join(tmpdir(), "avantiqo-video-i2v-v16-"));
const leasedGenerator = join(dir, "cache-avantiqo-video-wan22-i2v-a14b-safe-lease-v16-generator.mjs");
try {
  await writeFile(leasedGenerator, wrapper, "utf8");
  const syntax = spawnSync(process.execPath, ["--check", leasedGenerator], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (syntax.status !== 0) {
    throw new Error(`AVANTIQO_VIDEO_I2V_V16_GENERATOR_SYNTAX_FAILED:${text(syntax.stderr || syntax.stdout).slice(0, 2400)}`);
  }

  const preflight = spawnSync(process.execPath, [leasedGenerator], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (preflight.error) throw preflight.error;
  if (preflight.status !== 0) throw new Error(`AVANTIQO_VIDEO_I2V_V16_PREFLIGHT_FAILED:exit=${preflight.status}`);

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "APPLY",
    lease_controller: SAFE_LEASE_V2,
    lease_contract: "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
    lane: "cinema",
    ttl_ms: LEASE_TTL_MS,
    direct_workers_max_write: false,
    jobs_outside_safe_lease: 0,
    image_endpoint_mutation: false,
    endpoint_execution_timeout_mutation: false,
    partial_snapshot_certified_on_failure: false,
    rerun_may_resume_partial_snapshot: true,
    video_generation: false,
    inference: false,
    production_web_deploy: false,
  }, null, 2));

  const env = {
    ...process.env,
    AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED: "YES",
    AVANTIQO_VIDEO_WAN22_I2V_IMAGE_PATTERN_CACHE_APPROVED: "YES",
  };
  const child = spawnSync(
    process.execPath,
    [SAFE_LEASE_V2, "--lane=cinema", `--ttl-ms=${LEASE_TTL_MS}`, "--", process.execPath, leasedGenerator, "--apply"],
    { cwd: process.cwd(), env, stdio: "inherit" },
  );
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`AVANTIQO_VIDEO_I2V_V16_SAFE_LEASE_FAILED:exit=${child.status}`);
  console.log("AVANTIQO_VIDEO_WAN22_I2V_SAFE_LEASE_CACHE_V16_APPLIED=true");
} finally {
  await rm(dir, { recursive: true, force: true });
}
