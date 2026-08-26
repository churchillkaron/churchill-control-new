import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const V10_RUNNER = "scripts/cache-avantiqo-video-wan22-i2v-a14b-direct-pod-v10-local.mjs";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_I2V_A14B_DIRECT_POD_PROVEN_PLACEMENT_RETRY_V12";
const VIDEO_OWNED_PATHS = [
  "services/avantiqo-video-engine",
  "scripts/cache-avantiqo-video-wan22-t2v-a14b-direct-pod-v9-local.mjs",
  V10_RUNNER,
  "scripts/cache-avantiqo-video-wan22-i2v-a14b-direct-pod-v12-local.mjs",
  "audits/results/avantiqo-video-worker-image.json",
  "audits/results/avantiqo-image-v9-certification-lock.json",
];

const text = (value) => String(value ?? "").trim();

function shell(name, args, code, options = {}) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: options.env || process.env,
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = options.stdio === "inherit" ? `exit=${result.status}` : text(result.stderr || result.stdout).slice(0, 1600);
    throw new Error(`${code}:${detail}`);
  }
  return options.stdio === "inherit" ? "" : text(result.stdout);
}

function requireScopedMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_I2V_POD_CACHE_V12_FETCH_MAIN_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_I2V_POD_CACHE_V12_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_V12_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_I2V_POD_CACHE_V12_HEAD_READ_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_I2V_POD_CACHE_V12_REMOTE_READ_FAILED");
  const relation = shell(
    "git",
    ["rev-list", "--left-right", "--count", `${head}...${remote}`],
    "AVANTIQO_VIDEO_I2V_POD_CACHE_V12_MAIN_RELATION_FAILED",
  ).split(/\s+/).map(Number);
  if (Number(relation[0] || 0) !== 0) {
    throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_V12_MAIN_DIVERGED:head=${head}:origin=${remote}`);
  }
  if (head !== remote) {
    const changed = shell(
      "git",
      ["diff", "--name-only", head, remote, "--", ...VIDEO_OWNED_PATHS],
      "AVANTIQO_VIDEO_I2V_POD_CACHE_V12_SCOPED_DIFF_FAILED",
    );
    if (changed) {
      throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_V12_VIDEO_INPUTS_CHANGED_ON_MAIN:${changed.replace(/\n/g, ",")}`);
    }
    console.log(`AVANTIQO_VIDEO_I2V_POD_CACHE_V12_UNRELATED_MAIN_MOVEMENT_TOLERATED=true head=${head} origin=${remote}`);
  }
  const dirty = shell(
    "git",
    ["status", "--porcelain", "--untracked-files=no", "--", ...VIDEO_OWNED_PATHS],
    "AVANTIQO_VIDEO_I2V_POD_CACHE_V12_SOURCE_STATUS_FAILED",
  );
  if (dirty) throw new Error("AVANTIQO_VIDEO_I2V_POD_CACHE_V12_VIDEO_OWNED_FILES_HAVE_LOCAL_CHANGES");
  return head;
}

function replaceExactlyOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_ANCHOR_COUNT:${count}`);
  return source.replace(before, after);
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_V12_NODE24_REQUIRED:${process.version}`);
}

const mainSha = requireScopedMain();
let source = await readFile(V10_RUNNER, "utf8");

const helperAnchor = "if (Number(process.versions.node.split(\".\")[0]) < 24) {";
const helper = `function v12DirectPodCapacityError(error) {
  const message = text(error?.message || error).toLowerCase();
  return (
    message.includes("no longer any instances available") ||
    message.includes("no instances available") ||
    message.includes("insufficient capacity") ||
    message.includes("capacity unavailable")
  );
}

async function v12CreateProvenDirectPod(managementKey, body) {
  const attempts = Math.max(1, Math.min(60, Number(process.env.AVANTIQO_VIDEO_I2V_POD_CAPACITY_ATTEMPTS || 18)));
  const retryMs = Math.max(5000, Number(process.env.AVANTIQO_VIDEO_I2V_POD_CAPACITY_RETRY_MS || 10000));
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const created = await rest("/pods", managementKey, {
        method: "POST",
        timeoutMs: 60000,
        body,
      });
      console.log("AVANTIQO_VIDEO_I2V_POD_CACHE_V12_PLACEMENT_ACQUIRED=true attempt=" + attempt);
      return created;
    } catch (error) {
      if (!v12DirectPodCapacityError(error)) throw error;
      lastError = error;
      console.log("AVANTIQO_VIDEO_I2V_POD_CACHE_V12_CAPACITY_MISS=true attempt=" + attempt + " of=" + attempts);
      if (attempt < attempts) await sleep(retryMs);
    }
  }
  throw new Error("AVANTIQO_VIDEO_I2V_POD_CACHE_V12_NO_DIRECT_POD_CAPACITY:" + text(lastError?.message || lastError));
}

`;
source = replaceExactlyOnce(
  source,
  helperAnchor,
  helper + helperAnchor,
  "AVANTIQO_VIDEO_I2V_POD_CACHE_V12_HELPER",
);

const oldCreate = [
  '  const created = await rest("/pods", managementKey, {',
  '    method: "POST",',
  '    timeoutMs: 60_000,',
  '    body: {',
  '      name: podName,',
  '      cloudType: "SECURE",',
  '      computeType: "CPU",',
  '      cpuFlavorIds: ["cpu5g", "cpu3g", "cpu5c", "cpu3c", "cpu5m", "cpu3m"],',
  '      cpuFlavorPriority: "availability",',
  '      containerDiskInGb: 10,',
  '      imageName: "python:3.11-slim",',
  '      networkVolumeId: VOLUME_ID,',
  '      volumeMountPath: "/runpod-volume",',
  '      ports: [`${HTTP_PORT}/http`],',
  '      supportPublicIp: true,',
  '      dockerEntrypoint: [],',
  '      dockerStartCmd: ["python", "-c", bootstrapPython()],',
  '      env: podEnv,',
  '      interruptible: false,',
  '      locked: false,',
  '    },',
  '  });',
].join("\n");

const newCreate = [
  '  const created = await v12CreateProvenDirectPod(managementKey, {',
  '    name: podName,',
  '    cloudType: "SECURE",',
  '    computeType: "CPU",',
  '    cpuFlavorIds: ["cpu5g", "cpu3g", "cpu5c", "cpu3c", "cpu5m", "cpu3m"],',
  '    cpuFlavorPriority: "availability",',
  '    containerDiskInGb: 10,',
  '    imageName: "python:3.11-slim",',
  '    networkVolumeId: VOLUME_ID,',
  '    volumeMountPath: "/runpod-volume",',
  '    ports: [`${HTTP_PORT}/http`],',
  '    supportPublicIp: true,',
  '    dockerEntrypoint: [],',
  '    dockerStartCmd: ["python", "-c", bootstrapPython()],',
  '    env: podEnv,',
  '    interruptible: false,',
  '    locked: false,',
  '  });',
].join("\n");

source = replaceExactlyOnce(
  source,
  oldCreate,
  newCreate,
  "AVANTIQO_VIDEO_I2V_POD_CACHE_V12_CREATE",
);

const dir = await mkdtemp(join(tmpdir(), "avantiqo-video-i2v-pod-v12-"));
const path = join(dir, "cache-avantiqo-video-wan22-i2v-a14b-direct-pod-v12-compat.mjs");
try {
  await writeFile(path, source, "utf8");
  const syntax = spawnSync(process.execPath, ["--check", path], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (syntax.status !== 0) {
    throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_V12_CHILD_SYNTAX_FAILED:${text(syntax.stderr || syntax.stdout).slice(0, 2000)}`);
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    main_sha: mainSha,
    scope: "VIDEO_WITH_IMAGE_SHARED_VOLUME_GUARD_ONLY",
    placement_policy: {
      exact_v9_proven_request_shape: true,
      data_center_ids_sent: false,
      network_volume_drives_placement: true,
      compute_type: "CPU",
      default_capacity_attempts: 18,
      default_retry_ms: 10000,
      only_capacity_500_is_retried: true,
      schema_or_other_errors_fail_closed: true,
    },
    inherited_v10_gates: {
      t2v_independent_revalidation_before_i2v: true,
      i2v_file_and_size_integrity_check: true,
      incomplete_files_fail_closed: true,
      image_and_cinema_quiescence_required: true,
      temporary_pod_deleted_after_run: true,
    },
    image_endpoint_mutation: false,
    cinema_endpoint_mutation: false,
    serverless_job_submission: false,
    video_generation: false,
    inference: false,
    production_web_deploy: false,
    secrets_printed: false,
  }, null, 2));

  const child = spawnSync(process.execPath, [path, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_V12_CHILD_FAILED:exit=${child.status}`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
