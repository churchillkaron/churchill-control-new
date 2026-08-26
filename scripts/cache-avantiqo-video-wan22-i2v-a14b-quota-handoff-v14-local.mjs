import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const V13 = "scripts/cache-avantiqo-video-wan22-i2v-a14b-image-pattern-v13-local.mjs";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_I2V_A14B_QUOTA_HANDOFF_V14";
const text = (v) => String(v ?? "").trim();
const yes = (v) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(v).toUpperCase());

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_ANCHOR_COUNT:${count}`);
  return source.replace(before, after);
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_I2V_V14_NODE24_REQUIRED:${process.version}`);
}
const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_VIDEO_WAN22_I2V_QUOTA_HANDOFF_APPROVED)) {
  throw new Error("AVANTIQO_VIDEO_WAN22_I2V_QUOTA_HANDOFF_APPROVED=YES_REQUIRED");
}

let wrapper = await readFile(V13, "utf8");
const injectionAnchor = 'const dir = await mkdtemp(join(tmpdir(), "avantiqo-video-i2v-v13-"));';
const injection = String.raw`
// V14: lend the one configured Image worker slot to Cinema for this cache transaction only.
source = replaceExactly(
  source,
  'function assertCinemaFullyQuiescent(health, label) {',
  'function assertImageQuotaBorrowSafe(health, label) {\n  if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0 || health.workers.initializing !== 0 || health.workers.running !== 0 || health.workers.unhealthy !== 0) {\n    throw new Error(\`\${label}_IMAGE_BUSY:\${JSON.stringify(health)}\`);\n  }\n}\n\nfunction assertCinemaFullyQuiescent(health, label) {',
  1,
  "AVANTIQO_VIDEO_I2V_V14_IMAGE_HEALTH_GUARD",
);
source = replaceExactly(
  source,
  'const initial = await inventory(managementKey);',
  'let imageSlotBorrowed = false;\nconst initial = await inventory(managementKey);',
  1,
  "AVANTIQO_VIDEO_I2V_V14_IMAGE_BORROW_STATE",
);
source = replaceExactly(
  source,
  'safe.workers_max !== 1 ||',
  'safe.workers_max !== (imageSlotBorrowed ? 0 : 1) ||',
  1,
  "AVANTIQO_VIDEO_I2V_V14_IMAGE_EXPECTED_MAX",
);
source = replaceExactly(
  source,
  'const initialHealth = healthSummary(await queueRequest(text(cinema.id), "/health", queueCredential.key));',
  'const imageQueueCredential = await selectQueueCredential(text(image.id), [\n  text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY)\n    ? { source: "RUNPOD_AVANTIQO_IMAGE_API_KEY", key: text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) }\n    : null,\n  text(process.env.RUNPOD_API_KEY)\n    ? { source: "RUNPOD_API_KEY", key: text(process.env.RUNPOD_API_KEY) }\n    : null,\n  { source: "RUNPOD_MANAGEMENT_API_KEY", key: managementKey },\n]);\nconst initialImageHealth = healthSummary(await queueRequest(text(image.id), "/health", imageQueueCredential.key));\nassertImageQuotaBorrowSafe(initialImageHealth, "AVANTIQO_VIDEO_I2V_V14_INITIAL");\nconst initialHealth = healthSummary(await queueRequest(text(cinema.id), "/health", queueCredential.key));',
  1,
  "AVANTIQO_VIDEO_I2V_V14_IMAGE_QUEUE_GUARD",
);
source = replaceExactly(
  source,
  '  await rest(\`/endpoints/\${encodeURIComponent(text(cinema.id))}\`, managementKey, {\n    method: "PATCH",\n    body: { workersMax: 1 },\n  });',
  '  const imageHealthBeforeBorrow = healthSummary(await queueRequest(text(image.id), "/health", imageQueueCredential.key));\n  assertImageQuotaBorrowSafe(imageHealthBeforeBorrow, "AVANTIQO_VIDEO_I2V_V14_PRE_BORROW");\n  await rest(\`/endpoints/\${encodeURIComponent(text(image.id))}\`, managementKey, {\n    method: "PATCH",\n    body: { workersMax: 0 },\n  });\n  imageSlotBorrowed = true;\n  await waitForEndpoint(\n    text(image.id),\n    managementKey,\n    (endpoint) => finite(endpoint.workersMin) === 0 && finite(endpoint.workersMax) === 0,\n    "AVANTIQO_VIDEO_I2V_V14_IMAGE_SLOT_RELEASE",\n  );\n  const imageHealthAfterBorrow = healthSummary(await queueRequest(text(image.id), "/health", imageQueueCredential.key));\n  assertImageQuotaBorrowSafe(imageHealthAfterBorrow, "AVANTIQO_VIDEO_I2V_V14_POST_BORROW");\n  console.log("AVANTIQO_VIDEO_I2V_V14_IMAGE_WORKER_SLOT_RELEASED=true");\n\n  await rest(\`/endpoints/\${encodeURIComponent(text(cinema.id))}\`, managementKey, {\n    method: "PATCH",\n    body: { workersMax: 1 },\n  });',
  1,
  "AVANTIQO_VIDEO_I2V_V14_QUOTA_HANDOFF",
);
source = replaceExactly(
  source,
  '\n}\n\ntry {\n  const preTimeout = await revalidateBeforeMutation("AVANTIQO_VIDEO_T2V_CACHE_PRE_TIMEOUT");',
  '\n\n  if (imageSlotBorrowed) {\n    try {\n      const currentImage = await waitForEndpoint(text(image.id), managementKey, () => true, "AVANTIQO_VIDEO_I2V_V14_IMAGE_RESTORE_READ", 15_000);\n      if (finite(currentImage.workersMax) === 0) {\n        await rest(\`/endpoints/\${encodeURIComponent(text(image.id))}\`, managementKey, { method: "PATCH", body: { workersMax: 1 } });\n        await waitForEndpoint(text(image.id), managementKey, (endpoint) => finite(endpoint.workersMin) === 0 && finite(endpoint.workersMax) === 1, "AVANTIQO_VIDEO_I2V_V14_IMAGE_RESTORE");\n      } else if (finite(currentImage.workersMax) !== 1) {\n        throw new Error(\`AVANTIQO_VIDEO_I2V_V14_IMAGE_RESTORE_CONCURRENT_CHANGE:\${finite(currentImage.workersMax)}\`);\n      }\n      imageSlotBorrowed = false;\n      console.log("AVANTIQO_VIDEO_I2V_V14_IMAGE_WORKER_SLOT_RESTORED=true");\n    } catch (error) {\n      throw new Error(\`AVANTIQO_VIDEO_I2V_V14_IMAGE_RESTORE_REQUIRED:\${redact(text(error?.message || error))}\`);\n    }\n  }\n}\n\ntry {\n  const preTimeout = await revalidateBeforeMutation("AVANTIQO_VIDEO_T2V_CACHE_PRE_TIMEOUT");',
  1,
  "AVANTIQO_VIDEO_I2V_V14_RESTORE_IMAGE_SLOT",
);
source = source.split('image_endpoint_mutation: false,').join('image_endpoint_mutation: apply,');
`;
wrapper = replaceOnce(wrapper, injectionAnchor, `${injection}\n${injectionAnchor}`, "AVANTIQO_VIDEO_I2V_V14_INJECTION");
wrapper = wrapper.replace('const CONTRACT = "AVANTIQO_VIDEO_WAN22_I2V_A14B_IMAGE_PATTERN_CACHE_V13";', `const CONTRACT = "${CONTRACT}";`);
wrapper = wrapper.replace('mutation: false,\n      idle_ready_worker_allowed: true,', 'mutation: process.argv.includes("--apply"),\n      quota_slot_lend_only: true,\n      idle_ready_worker_allowed: true,');

const dir = await mkdtemp(join(tmpdir(), "avantiqo-video-i2v-v14-"));
const patchedV13 = join(dir, "cache-avantiqo-video-wan22-i2v-a14b-quota-handoff-v14-generator.mjs");
try {
  await writeFile(patchedV13, wrapper, "utf8");
  const syntax = spawnSync(process.execPath, ["--check", patchedV13], { cwd: process.cwd(), encoding: "utf8", env: process.env });
  if (syntax.status !== 0) throw new Error(`AVANTIQO_VIDEO_I2V_V14_GENERATOR_SYNTAX_FAILED:${text(syntax.stderr || syntax.stdout).slice(0, 2400)}`);

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    quota_handoff: {
      scope: "IMAGE_VIDEO_ONLY",
      image_workers_max: "1_TO_0_TO_1",
      cinema_workers_max: "0_TO_1_TO_0",
      other_endpoints_mutated: false,
      shared_volume_rebind: false,
      gpu_pool_rebind: false,
    },
    safety: {
      image_must_have_no_queued_or_running_work: true,
      idle_ready_image_worker_allowed: true,
      image_restore_is_cleanup_critical: true,
      exact_video_job_cancel_on_wait_failure: true,
      video_generation: false,
      inference: false,
      production_web_deploy: false,
    },
  }, null, 2));

  const env = {
    ...process.env,
    ...(apply ? { AVANTIQO_VIDEO_WAN22_I2V_IMAGE_PATTERN_CACHE_APPROVED: "YES" } : {}),
  };
  const child = spawnSync(process.execPath, [patchedV13, ...process.argv.slice(2)], { cwd: process.cwd(), env, stdio: "inherit" });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`AVANTIQO_VIDEO_I2V_V14_CHILD_FAILED:exit=${child.status}`);
  if (apply) console.log("AVANTIQO_VIDEO_WAN22_I2V_QUOTA_HANDOFF_V14_APPLIED=true");
} finally {
  await rm(dir, { recursive: true, force: true });
}
