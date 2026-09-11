import crypto from "node:crypto";

function text(value) {
  return String(value ?? "").trim();
}

export const CREATIVE_PRODUCTION_HANDOFF_IDENTITY_CONTRACT =
  "CREATIVE_PRODUCTION_HANDOFF_IDENTITY_V1";

export function productionHandoffKey(graph = {}) {
  const metadata = graph?.metadata && typeof graph.metadata === "object" ? graph.metadata : {};
  const workflow = text(metadata.workflow_kind).toUpperCase();
  const masterPlanHash = text(metadata.master_plan_hash);
  const rehearsalDigest = text(metadata.production_room_entry_gate?.rehearsal_digest);
  if (workflow !== "TEMPORAL" || !masterPlanHash || !rehearsalDigest) return null;

  return crypto.createHash("sha256").update(JSON.stringify({
    contract: CREATIVE_PRODUCTION_HANDOFF_IDENTITY_CONTRACT,
    organization_id: text(graph.organization_id),
    creative_project_id: text(graph.creative_project_id),
    master_plan_hash: masterPlanHash,
    rehearsal_digest: rehearsalDigest,
  })).digest("hex");
}

export function assertTemporalProductionHandoff(graph = {}) {
  const metadata = graph?.metadata && typeof graph.metadata === "object" ? graph.metadata : {};
  if (text(metadata.workflow_kind).toUpperCase() !== "TEMPORAL") return true;
  const pipeline = metadata.production_room_pipeline;
  const gate = metadata.production_room_entry_gate;
  if (pipeline?.contract !== "CREATIVE_PRODUCTION_ROOM_PIPELINE_V1") {
    throw new Error("CREATIVE_TEMPORAL_PRODUCTION_ROOM_PIPELINE_REQUIRED");
  }
  if (gate?.passed !== true || !text(gate.rehearsal_digest)) {
    throw new Error("CREATIVE_TEMPORAL_VIRTUAL_REHEARSAL_GATE_REQUIRED");
  }
  const rehearsal = Array.isArray(pipeline.stages)
    ? pipeline.stages.find((stage) => stage?.id === "VIRTUAL_REHEARSAL")
    : null;
  if (rehearsal?.status !== "SEALED" || text(rehearsal?.sealed_digest) !== text(gate.rehearsal_digest)) {
    throw new Error("CREATIVE_TEMPORAL_REHEARSAL_LINEAGE_MISMATCH");
  }
  if (!text(metadata.master_plan_hash)) {
    throw new Error("CREATIVE_TEMPORAL_MASTER_PLAN_HASH_REQUIRED");
  }
  return true;
}
