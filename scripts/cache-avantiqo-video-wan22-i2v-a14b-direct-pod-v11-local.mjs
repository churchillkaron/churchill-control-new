import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const V10_RUNNER = "scripts/cache-avantiqo-video-wan22-i2v-a14b-direct-pod-v10-local.mjs";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_I2V_A14B_DIRECT_POD_CAPACITY_AWARE_V11";
const VIDEO_OWNED_PATHS = [
  "services/avantiqo-video-engine",
  "scripts/cache-avantiqo-video-wan22-t2v-a14b-direct-pod-v9-local.mjs",
  V10_RUNNER,
  "scripts/cache-avantiqo-video-wan22-i2v-a14b-direct-pod-v11-local.mjs",
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
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_I2V_POD_CACHE_V11_FETCH_MAIN_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_I2V_POD_CACHE_V11_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_V11_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_I2V_POD_CACHE_V11_HEAD_READ_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_I2V_POD_CACHE_V11_REMOTE_READ_FAILED");
  const relation = shell(
    "git",
    ["rev-list", "--left-right", "--count", `${head}...${remote}`],
    "AVANTIQO_VIDEO_I2V_POD_CACHE_V11_MAIN_RELATION_FAILED",
  ).split(/\s+/).map(Number);
  if (Number(relation[0] || 0) !== 0) {
    throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_V11_MAIN_DIVERGED:head=${head}:origin=${remote}`);
  }
  if (head !== remote) {
    const changed = shell(
      "git",
      ["diff", "--name-only", head, remote, "--", ...VIDEO_OWNED_PATHS],
      "AVANTIQO_VIDEO_I2V_POD_CACHE_V11_SCOPED_DIFF_FAILED",
    );
    if (changed) {
      throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_V11_VIDEO_INPUTS_CHANGED_ON_MAIN:${changed.replace(/\n/g, ",")}`);
    }
    console.log(`AVANTIQO_VIDEO_I2V_POD_CACHE_V11_UNRELATED_MAIN_MOVEMENT_TOLERATED=true head=${head} origin=${remote}`);
  }
  const dirty = shell(
    "git",
    ["status", "--porcelain", "--untracked-files=no", "--", ...VIDEO_OWNED_PATHS],
    "AVANTIQO_VIDEO_I2V_POD_CACHE_V11_SOURCE_STATUS_FAILED",
  );
  if (dirty) throw new Error("AVANTIQO_VIDEO_I2V_POD_CACHE_V11_VIDEO_OWNED_FILES_HAVE_LOCAL_CHANGES");
  return head;
}

function replaceExactlyOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}_ANCHOR_COUNT:${count}`);
  return source.replace(before, after);
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_V11_NODE24_REQUIRED:${process.version}`);
}

const mainSha = requireScopedMain();
let source = await readFile(V10_RUNNER, "utf8");

const helperAnchor = "if (Number(process.versions.node.split(\".\")[0]) < 24) {";
const capacityHelper = `const V11_CPU_FLAVORS = ["cpu5g", "cpu3g", "cpu5c", "cpu3c", "cpu5m", "cpu3m"];
const V11_GPU_TYPES = [
  "NVIDIA GeForce RTX 4090",
  "NVIDIA RTX A5000",
  "NVIDIA RTX A6000",
  "NVIDIA A40",
  "NVIDIA L4",
  "NVIDIA L40",
  "NVIDIA L40S",
  "NVIDIA RTX 6000 Ada Generation",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA B200",
  "NVIDIA A100 80GB PCIe",
  "NVIDIA A100-SXM4-80GB",
  "NVIDIA H100 PCIe",
  "NVIDIA H100 80GB HBM3",
  "NVIDIA H200",
];

function v11CapacityError(error) {
  const message = text(error?.message || error).toLowerCase();
  return (
    message.includes("no longer any instances available") ||
    message.includes("no instances available") ||
    message.includes("insufficient capacity") ||
    message.includes("capacity unavailable")
  );
}

function v11CommonPodBody(podName, podEnv) {
  return {
    name: podName,
    cloudType: "SECURE",
    dataCenterIds: [VOLUME_DC],
    dataCenterPriority: "availability",
    containerDiskInGb: 10,
    imageName: "python:3.11-slim",
    networkVolumeId: VOLUME_ID,
    volumeMountPath: "/runpod-volume",
    ports: [String(HTTP_PORT) + "/http"],
    supportPublicIp: true,
    dockerEntrypoint: [],
    dockerStartCmd: ["python", "-c", bootstrapPython()],
    env: podEnv,
    interruptible: false,
    locked: false,
  };
}

async function v11CreateCapacityAwarePod(managementKey, podName, podEnv) {
  const common = v11CommonPodBody(podName, podEnv);
  const rounds = Math.max(1, Math.min(20, Number(process.env.AVANTIQO_VIDEO_I2V_POD_CAPACITY_ROUNDS || 8)));
  const retryMs = Math.max(5000, Number(process.env.AVANTIQO_VIDEO_I2V_POD_CAPACITY_RETRY_MS || 15000));
  const profiles = [
    { label: "CPU_AUTO_2", body: { ...common, computeType: "CPU", vcpuCount: 2 } },
    {
      label: "CPU_FLAVOR_2",
      body: { ...common, computeType: "CPU", cpuFlavorIds: V11_CPU_FLAVORS, cpuFlavorPriority: "availability", vcpuCount: 2 },
    },
    {
      label: "CPU_FLAVOR_4",
      body: { ...common, computeType: "CPU", cpuFlavorIds: V11_CPU_FLAVORS, cpuFlavorPriority: "availability", vcpuCount: 4 },
    },
    {
      label: "GPU_DOWNLOAD_ONLY",
      body: {
        ...common,
        computeType: "GPU",
        gpuCount: 1,
        gpuTypeIds: V11_GPU_TYPES,
        gpuTypePriority: "availability",
        minVCPUPerGPU: 2,
        minRAMPerGPU: 4,
      },
    },
  ];
  let misses = 0;
  for (let round = 1; round <= rounds; round += 1) {
    for (const profile of profiles) {
      try {
        const created = await rest("/pods", managementKey, { method: "POST", timeoutMs: 60000, body: profile.body });
        console.log("AVANTIQO_VIDEO_I2V_POD_CACHE_V11_PLACEMENT_ACQUIRED=true profile=" + profile.label + " round=" + round);
        return created;
      } catch (error) {
        if (!v11CapacityError(error)) throw error;
        misses += 1;
        console.log("AVANTIQO_VIDEO_I2V_POD_CACHE_V11_CAPACITY_MISS=true profile=" + profile.label + " round=" + round);
      }
    }
    if (round < rounds) {
      console.log("AVANTIQO_VIDEO_I2V_POD_CACHE_V11_CAPACITY_RETRY=true next_round=" + (round + 1) + " wait_ms=" + retryMs);
      await sleep(retryMs);
    }
  }
  throw new Error("AVANTIQO_VIDEO_I2V_POD_CACHE_V11_NO_DIRECT_POD_CAPACITY:attempts=" + misses);
}

`;
source = replaceExactlyOnce(
  source,
  helperAnchor,
  capacityHelper + helperAnchor,
  "AVANTIQO_VIDEO_I2V_POD_CACHE_V11_HELPER",
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
source = replaceExactlyOnce(
  source,
  oldCreate,
  "  const created = await v11CreateCapacityAwarePod(managementKey, podName, podEnv);",
  "AVANTIQO_VIDEO_I2V_POD_CACHE_V11_CREATE",
);

source = replaceExactlyOnce(
  source,
  '    compute_type: "CPU",',
  '    compute_type: "CAPACITY_AWARE_CPU_THEN_GPU_DOWNLOAD_ONLY",',
  "AVANTIQO_VIDEO_I2V_POD_CACHE_V11_PLAN_COMPUTE_TYPE",
);

const dir = await mkdtemp(join(tmpdir(), "avantiqo-video-i2v-pod-v11-"));
const path = join(dir, "cache-avantiqo-video-wan22-i2v-a14b-direct-pod-v11-compat.mjs");
try {
  await writeFile(path, source, "utf8");
  const syntax = spawnSync(process.execPath, ["--check", path], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (syntax.status !== 0) {
    throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_V11_CHILD_SYNTAX_FAILED:${text(syntax.stderr || syntax.stdout).slice(0, 2000)}`);
  }
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    main_sha: mainSha,
    scope: "VIDEO_WITH_IMAGE_SHARED_VOLUME_GUARD_ONLY",
    capacity_policy: {
      cpu_first: true,
      cpu_profiles: ["AUTO_2_VCPU", "FLAVOR_2_VCPU", "FLAVOR_4_VCPU"],
      gpu_fallback_download_only: true,
      exact_data_center: "US-NC-2",
      existing_network_volume_only: true,
      one_active_pod_maximum: true,
      capacity_creation_failures_do_not_leave_resources: true,
      default_rounds: 8,
      default_retry_ms: 15000,
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
  if (child.status !== 0) throw new Error(`AVANTIQO_VIDEO_I2V_POD_CACHE_V11_CHILD_FAILED:exit=${child.status}`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
