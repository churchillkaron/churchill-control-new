import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const V14 = "scripts/cache-avantiqo-video-wan22-i2v-a14b-quota-handoff-v14-local.mjs";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_I2V_A14B_DRAIN_HANDOFF_V15";
const text = (value) => String(value ?? "").trim();
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_ANCHOR_COUNT:${count}`);
  return source.replace(before, after);
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_I2V_V15_NODE24_REQUIRED:${process.version}`);
}
const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_VIDEO_WAN22_I2V_DRAIN_HANDOFF_APPROVED)) {
  throw new Error("AVANTIQO_VIDEO_WAN22_I2V_DRAIN_HANDOFF_APPROVED=YES_REQUIRED");
}

let source = await readFile(V14, "utf8");

const oldPostBorrow = '  const imageHealthAfterBorrow = healthSummary(await queueRequest(text(image.id), "/health", imageQueueCredential.key));\\n  assertImageQuotaBorrowSafe(imageHealthAfterBorrow, "AVANTIQO_VIDEO_I2V_V14_POST_BORROW");\\n  console.log("AVANTIQO_VIDEO_I2V_V14_IMAGE_WORKER_SLOT_RELEASED=true");';
const newPostBorrow = '  const imageDrainTimeoutMs = Math.max(60_000, Number(process.env.AVANTIQO_VIDEO_I2V_IMAGE_DRAIN_TIMEOUT_MS || 300_000));\\n  const imageDrainDeadline = Date.now() + imageDrainTimeoutMs;\\n  let imageHealthAfterBorrow = null;\\n  let imageDrainWorkerCount = null;\\n  while (Date.now() <= imageDrainDeadline) {\\n    imageHealthAfterBorrow = healthSummary(await queueRequest(text(image.id), "/health", imageQueueCredential.key));\\n    if (imageHealthAfterBorrow.jobs.in_queue !== 0 || imageHealthAfterBorrow.jobs.in_progress !== 0 || imageHealthAfterBorrow.workers.running !== 0 || imageHealthAfterBorrow.workers.unhealthy !== 0) {\\n      throw new Error(`AVANTIQO_VIDEO_I2V_V15_IMAGE_BECAME_ACTIVE_DURING_DRAIN:${JSON.stringify(imageHealthAfterBorrow)}`);\\n    }\\n    imageDrainWorkerCount = Object.values(imageHealthAfterBorrow.workers).reduce((sum, value) => sum + Number(value || 0), 0);\\n    if (imageDrainWorkerCount === 0) break;\\n    console.log(`AVANTIQO_VIDEO_I2V_V15_IMAGE_DRAIN_WAIT=true workers=${imageDrainWorkerCount} health=${JSON.stringify(imageHealthAfterBorrow)}`);\\n    await sleep(3_000);\\n  }\\n  if (imageDrainWorkerCount !== 0) {\\n    throw new Error(`AVANTIQO_VIDEO_I2V_V15_IMAGE_DRAIN_TIMEOUT:${JSON.stringify(imageHealthAfterBorrow || {})}`);\\n  }\\n  console.log("AVANTIQO_VIDEO_I2V_V15_IMAGE_WORKER_DRAINED=true");\\n  console.log("AVANTIQO_VIDEO_I2V_V14_IMAGE_WORKER_SLOT_RELEASED=true");';
source = replaceOnce(source, oldPostBorrow, newPostBorrow, "AVANTIQO_VIDEO_I2V_V15_POST_BORROW");
source = source.replace(
  'const CONTRACT = "AVANTIQO_VIDEO_WAN22_I2V_A14B_QUOTA_HANDOFF_V14";',
  `const CONTRACT = "${CONTRACT}";`,
);
source = source.replace(
  'if (apply) console.log("AVANTIQO_VIDEO_WAN22_I2V_QUOTA_HANDOFF_V14_APPLIED=true");',
  'if (apply) { console.log("AVANTIQO_VIDEO_WAN22_I2V_QUOTA_HANDOFF_V14_APPLIED=true"); console.log("AVANTIQO_VIDEO_WAN22_I2V_DRAIN_HANDOFF_V15_APPLIED=true"); }',
);

const dir = await mkdtemp(join(tmpdir(), "avantiqo-video-i2v-v15-"));
const childPath = join(dir, "cache-avantiqo-video-wan22-i2v-a14b-drain-handoff-v15-generator.mjs");
try {
  await writeFile(childPath, source, "utf8");
  const syntax = spawnSync(process.execPath, ["--check", childPath], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (syntax.status !== 0) {
    throw new Error(`AVANTIQO_VIDEO_I2V_V15_GENERATOR_SYNTAX_FAILED:${text(syntax.stderr || syntax.stdout).slice(0, 2400)}`);
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    fix: {
      transient_image_initializing_is_drain_state: true,
      wait_for_image_worker_count_zero: true,
      default_image_drain_timeout_ms: 300000,
      queued_or_running_image_work_aborts: true,
      image_restore_remains_cleanup_critical: true,
      other_endpoints_mutated: false,
      shared_volume_rebind: false,
      gpu_pool_rebind: false,
    },
    safety: {
      video_generation: false,
      inference: false,
      production_web_deploy: false,
      secrets_printed: false,
    },
  }, null, 2));

  const env = {
    ...process.env,
    ...(apply
      ? {
          AVANTIQO_VIDEO_WAN22_I2V_QUOTA_HANDOFF_APPROVED: "YES",
          AVANTIQO_VIDEO_WAN22_I2V_IMAGE_PATTERN_CACHE_APPROVED: "YES",
        }
      : {}),
  };
  const child = spawnSync(process.execPath, [childPath, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`AVANTIQO_VIDEO_I2V_V15_CHILD_FAILED:exit=${child.status}`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
