import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeProductionDossierExecutionGate,
} from "@/lib/creative/production/dossier/runtime/CreativeProductionDossierExecutionGate";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.production-dossier-evidence-persistence.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

async function persistEvidence(task = {}, evidence = {}) {
  if (!task.id) throw new Error("PRODUCTION_DOSSIER_TASK_ID_REQUIRED");

  const current = await ProductionTaskRuntime.get(task.id);
  if (!current) throw new Error("Production task not found");

  const sealedMode = evidence.mode === "SEALED_PREPRODUCTION_GATE";
  const updated = await ProductionTaskRuntime.update(task.id, {
    cost: {
      ...object(current.cost),
      approved: true,
    },
    metadata: {
      ...object(current.metadata),
      production_dossier_mode: evidence.mode || null,
      production_dossier_asset_node_id:
        evidence.dossier?.id || null,
      production_dossier_approval_record_asset_node_id:
        evidence.approval?.id || null,
      approved_dossier_hash:
        evidence.dossier?.metadata?.dossier_hash || null,
      approved_plan_hash:
        evidence.dossier?.metadata?.plan_hash || null,
      approved_graph_hash:
        evidence.dossier?.metadata?.graph_hash ||
        evidence.graphPreviewHash || null,
      approved_execution_hash:
        evidence.dossier?.metadata?.execution_hash ||
        evidence.preproductionGateHash || null,
      approved_manifest_hash:
        evidence.manifestHash || null,
      approved_cost_ceiling: evidence.ceiling ?? null,
      production_dossier_gate_passed: true,
      sealed_preproduction_gate_passed: sealedMode,
      production_dossier_evidence_contract:
        "CREATIVE_PRODUCTION_DOSSIER_EVIDENCE_V1",
    },
  });

  // Preparation gates pass this object onward. Mutating it keeps subsequent
  // task updates from replacing the freshly persisted dossier evidence with
  // stale metadata from the pre-verification row.
  Object.assign(task, updated);
  return updated;
}

function install() {
  if (CreativeProductionDossierExecutionGate[INSTALL_FLAG]) return;

  const approveWithoutEvidencePersistence =
    CreativeProductionDossierExecutionGate.approvedDossier.bind(
      CreativeProductionDossierExecutionGate,
    );

  Object.defineProperty(
    CreativeProductionDossierExecutionGate,
    INSTALL_FLAG,
    {
      value: true,
      enumerable: false,
      configurable: false,
    },
  );

  CreativeProductionDossierExecutionGate.approvedDossier =
    async function approvedDossierWithEvidence(task = {}) {
      const evidence = await approveWithoutEvidencePersistence(task);
      await persistEvidence(task, evidence);
      return evidence;
    };
}

install();

export const CreativeProductionDossierEvidenceRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_PRODUCTION_DOSSIER_EVIDENCE_V1",
  persistEvidence,
});
