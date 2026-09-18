import crypto from "node:crypto";

export const AVANTIQO_DISTRIBUTED_RENDER_WORKER_CONTRACT =
  "AVANTIQO_DISTRIBUTED_RENDER_WORKER_V1";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function workerMap(workers = []) {
  return new Map(list(workers).map((worker) => [text(worker.worker_id || worker.id), worker]));
}
function endpoint(worker = {}) {
  const value = text(worker.render_endpoint || worker.endpoint);
  if (!/^https:\/\//i.test(value) && !/^http:\/\/127\.0\.0\.1(?::\d+)?\//i.test(value)) {
    throw new Error("RENDER_WORKER_TRUSTED_ENDPOINT_REQUIRED");
  }
  return value;
}

export async function dispatchDistributedRenderChunk({
  project, scene, assignment, workers = [], fetch_impl = fetch,
} = {}) {
  const worker = workerMap(workers).get(text(assignment?.worker_id));
  if (!worker) throw new Error("RENDER_WORKER_ASSIGNMENT_NOT_RESOLVED");
  const url = endpoint(worker);
  const request = {
    contract: AVANTIQO_DISTRIBUTED_RENDER_WORKER_CONTRACT,
    organization_id: project?.organization_id,
    creative_project_id: project?.id,
    worker_id: text(assignment.worker_id),
    assignment: {
      chunk_id: assignment.chunk_id,
      frame_start: assignment.frame_start,
      frame_end: assignment.frame_end,
      frame_count: assignment.frame_count,
    },
    scene,
  };
  const response = await fetch_impl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(text(worker.authorization) ? { Authorization: text(worker.authorization) } : {}),
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error("RENDER_WORKER_REMOTE_EXECUTION_FAILED:" + response.status);
  const result = await response.json();
  if (text(result.chunk_id) !== text(assignment.chunk_id)) throw new Error("RENDER_WORKER_CHUNK_ID_MISMATCH");
  if (!text(result.checksum)) throw new Error("RENDER_WORKER_CHECKSUM_REQUIRED");
  if (Number(result.frame_count) !== Number(assignment.frame_count)) {
    throw new Error("RENDER_WORKER_FRAME_COUNT_MISMATCH");
  }
  const evidence = {
    worker_id: text(assignment.worker_id),
    worker_endpoint: url,
    chunk_id: assignment.chunk_id,
    checksum: text(result.checksum),
    frame_count: Number(result.frame_count),
    bytes: Number(result.bytes || 0),
    remote_execution: true,
    local_render_fallback_used: false,
  };
  return {
    ...result,
    ...evidence,
    worker_evidence_hash: hash(evidence),
    provider_calls_performed: false,
  };
}

export const CreativeDistributedRenderWorkerRuntime = Object.freeze({
  contract: AVANTIQO_DISTRIBUTED_RENDER_WORKER_CONTRACT,
  dispatch: dispatchDistributedRenderChunk,
});
