import * as Repository
from "../repositories/ProductionGraphRepository";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function text(value) { return String(value ?? "").trim(); }

function assertApprovalEvidence(values = {}) {
  const metadata = object(values.metadata);
  const costPlan = object(values.cost_plan);
  if (text(values.status).toUpperCase() !== "APPROVED") {
    throw new Error("PRODUCTION_GRAPH_APPROVAL_STATUS_REQUIRED");
  }
  if (costPlan.approval_required !== true || costPlan.approved !== true ||
      !(Number(costPlan.approved_cost) > 0)) {
    throw new Error("PRODUCTION_GRAPH_APPROVED_COST_REQUIRED");
  }
  if (metadata.production_dossier_human_approved !== true ||
      !text(metadata.production_dossier_approval_record_asset_node_id) ||
      !text(metadata.approved_dossier_hash) || !text(metadata.approved_plan_hash) ||
      !text(metadata.approved_graph_hash) || !text(metadata.approved_execution_hash)) {
    throw new Error("PRODUCTION_GRAPH_APPROVAL_EVIDENCE_REQUIRED");
  }
}

export const CreativeProductionGraphApprovalMutationRuntime = Object.freeze({
  async approve(id, values = {}) {
    const current = await Repository.getById(id);
    if (!current) throw new Error("PRODUCTION_GRAPH_NOT_FOUND");
    assertApprovalEvidence(values);
    return Repository.update(id, values);
  },
  assertApprovalEvidence,
  contract: "CREATIVE_PRODUCTION_GRAPH_APPROVAL_MUTATION_V1",
});
