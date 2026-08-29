#!/usr/bin/env node

import {
  finite,
  podRest,
  podTerminal,
  text,
} from "../lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRunpod.js";

const CONTRACT = "AVANTIQO_VIDEO_SHARED_CACHE_ACTIVE_POD_REPAIR_V1";
const APPROVAL = "AVANTIQO_VIDEO_SHARED_CACHE_ACTIVE_POD_REPAIR_APPROVED";
const VIDEO_VOLUME_ID = "t4erb6kxi1";
const SAFE_CPU_PREFIXES = Object.freeze([
  "avantiqo-video-volume-bridge-",
  "avantiqo-video-flashvsr-cache-cpu-",
]);
const TERMINAL = new Set(["EXITED", "TERMINATED", "DELETED", "STOPPED"]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());

function podStatus(pod = {}) {
  return text(pod.status || pod.workerStatus || pod.runtimeStatus || pod.desiredStatus).toUpperCase();
}

function podVolumeId(pod = {}) {
  return text(pod?.networkVolume?.id ?? pod?.networkVolumeId ?? pod?.network_volume_id);
}

function podGpuCount(pod = {}) {
  return Math.max(0, finite(
    pod?.gpu?.count ?? pod?.gpuCount ?? pod?.gpu_count ?? pod?.machine?.gpuCount ?? pod?.machine?.gpu_count,
    0,
  ));
}

function sanitized(pod = {}) {
  return {
    id: text(pod.id),
    name: text(pod.name),
    status: podStatus(pod) || "UNKNOWN",
    network_volume_id: podVolumeId(pod) || null,
    compute_type: text(pod.computeType ?? pod.compute_type) || (podGpuCount(pod) > 0 ? "GPU" : "UNKNOWN"),
    gpu_count: podGpuCount(pod),
    gpu_type_id: text(pod?.machine?.gpuTypeId ?? pod?.machine?.gpuType?.id ?? pod?.gpuTypeId ?? pod?.gpu_type_id) || null,
    created_at: text(pod.createdAt ?? pod.created_at) || null,
    last_started_at: text(pod.lastStartedAt ?? pod.last_started_at) || null,
  };
}

function safeOwnedCpuPod(pod = {}) {
  const name = text(pod.name);
  return SAFE_CPU_PREFIXES.some((prefix) => name.startsWith(prefix)) && podGpuCount(pod) === 0;
}

async function activeSharedPods() {
  const raw = await podRest("/pods?includeNetworkVolume=true&includeWorkers=true", { timeoutMs: 30_000 });
  const pods = Array.isArray(raw) ? raw : Array.isArray(raw?.pods) ? raw.pods : [];
  return pods.filter((pod) => podVolumeId(pod) === VIDEO_VOLUME_ID && !podTerminal(pod) && !TERMINAL.has(podStatus(pod)));
}

async function deleteAndVerify(pod) {
  const id = text(pod.id);
  if (!id) throw new Error(`${CONTRACT}_POD_ID_REQUIRED`);
  await podRest(`/pods/${encodeURIComponent(id)}`, { method: "DELETE", timeoutMs: 60_000 }).catch((error) => {
    if (!text(error?.message).includes("HTTP_404")) throw error;
  });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const current = await podRest(`/pods/${encodeURIComponent(id)}?includeNetworkVolume=true`, { timeoutMs: 15_000 });
      if (podTerminal(current) || TERMINAL.has(podStatus(current))) return true;
    } catch (error) {
      if (text(error?.message).includes("HTTP_404")) return true;
      throw error;
    }
    await sleep(3_000);
  }
  throw new Error(`${CONTRACT}_DELETE_TIMEOUT:${id}`);
}

if (Number(process.versions.node.split(".")[0]) < 20) {
  throw new Error(`${CONTRACT}_NODE20_REQUIRED:${process.version}`);
}
if (!approved(process.env[APPROVAL])) throw new Error(`${APPROVAL}=YES_REQUIRED`);

const before = await activeSharedPods();
const safe = before.filter(safeOwnedCpuPod);
const unsafe = before.filter((pod) => !safeOwnedCpuPod(pod));

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  shared_video_volume_id: VIDEO_VOLUME_ID,
  active_shared_pods_before: before.map(sanitized),
  safe_owned_stale_cpu_pods: safe.map(sanitized),
  protected_unknown_or_parallel_pods: unsafe.map(sanitized),
  deletion_scope: "ONLY_AVANTIQO_VIDEO_CPU_BRIDGE_OR_FLASHVSR_CACHE_CPU",
  gpu_pod_deletion_allowed: false,
  unknown_pod_deletion_allowed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

for (const pod of safe) await deleteAndVerify(pod);

const after = await activeSharedPods();
const protectedAfter = after.filter((pod) => !safeOwnedCpuPod(pod));
if (protectedAfter.length) {
  console.log(JSON.stringify({
    success: false,
    contract: CONTRACT,
    repaired_safe_cpu_pods: safe.length,
    active_shared_pods_after: after.map(sanitized),
    blocked_reason: "LEGITIMATE_OR_UNKNOWN_SHARED_VOLUME_POD_REMAINS",
    no_gpu_pod_deleted: true,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
  throw new Error(`${CONTRACT}_PROTECTED_ACTIVE_POD_REMAINS:${protectedAfter.length}`);
}

if (after.length) throw new Error(`${CONTRACT}_SAFE_CPU_POD_DELETE_INCOMPLETE:${after.length}`);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  repaired_safe_cpu_pods: safe.length,
  active_shared_pods_after: 0,
  gpu_pod_deleted: false,
  unknown_pod_deleted: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
