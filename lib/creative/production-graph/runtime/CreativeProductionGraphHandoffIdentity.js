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
