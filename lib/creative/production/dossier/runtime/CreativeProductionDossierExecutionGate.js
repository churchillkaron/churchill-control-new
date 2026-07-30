import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeApprovalRuntime,
} from "@/lib/creative/release/runtime/CreativeApprovalRuntime";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import * as ProductionGraphRepository
from "@/lib/creative/production-graph/repositories/ProductionGraphRepository";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.production-dossier-execution-gate.v1",
);

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function approvedDossier(task = {}) {
  if (!task.production_graph_id) {
    throw new Error("PRODUCTION_DOSSIER_GRAPH_ID_REQUIRED");
  }
  const graph = await ProductionGraphRepository.getById(task.production_graph_id);
  if (!graph || String(graph.organization_id) !== String(task.organization_id)) {
    throw new Error("PRODUCTION_DOSSIER_GRAPH_NOT_FOUND");
  }
  if (graph.status !== "APPROVED") {
    throw new Error("PRODUCTION_DOSSIER_GRAPH_APPROVAL_REQUIRED");
  }

  const dossierId = text(graph.metadata?.production_dossier_asset_node_id);
  if (!dossierId) throw new Error("PRODUCTION_DOSSIER_ASSET_NODE_REQUIRED");
  const dossier = await AssetGraphRepository.getById(dossierId);
  if (
    !dossier ||
    String(dossier.organization_id) !== String(task.organization_id) ||
    String(dossier.creative_project_id) !== String(task.creative_project_id) ||
    dossier.type !== "PRODUCTION_DOSSIER" ||
    dossier.status !== "APPROVED"
  ) {
    throw new Error("APPROVED_PRODUCTION_DOSSIER_REQUIRED");
  }
  if (dossier.review?.human_reviewed !== true || dossier.review?.approved !== true) {
    throw new Error("PRODUCTION_DOSSIER_HUMAN_APPROVAL_REQUIRED");
  }

  const approval = await CreativeApprovalRuntime.findCurrentApproval({
    organization_id: task.organization_id,
    subject_asset_node_id: dossier.id,
    scope: "PRODUCTION_DOSSIER",
  });
  if (!approval) throw new Error("CURRENT_PRODUCTION_DOSSIER_APPROVAL_REQUIRED");

  const comparisons = [
    ["dossier", dossier.metadata?.dossier_hash, graph.metadata?.approved_dossier_hash],
    ["plan", dossier.metadata?.plan_hash, graph.metadata?.approved_plan_hash],
    ["graph", dossier.metadata?.graph_hash, graph.metadata?.approved_graph_hash],
    ["execution", dossier.metadata?.execution_hash, graph.metadata?.approved_execution_hash],
  ];
  for (const [label, dossierHash, approvedHash] of comparisons) {
    if (!text(dossierHash) || text(dossierHash) !== text(approvedHash)) {
      throw new Error(`PRODUCTION_DOSSIER_${label.toUpperCase()}_HASH_MISMATCH`);
    }
  }

  const ceiling = finite(graph.metadata?.approved_cost_ceiling);
  const estimated = finite(graph.metadata?.estimated_production_cost);
  if (ceiling === null || ceiling < 0) {
    throw new Error("PRODUCTION_DOSSIER_APPROVED_COST_CEILING_REQUIRED");
  }
  if (estimated === null || estimated < 0 || estimated > ceiling) {
    throw new Error("PRODUCTION_DOSSIER_COST_CEILING_EXCEEDED");
  }
  if (finite(approval.metadata?.approved_cost_ceiling) !== ceiling) {
    throw new Error("PRODUCTION_DOSSIER_APPROVAL_COST_CEILING_MISMATCH");
  }

  const tasks = await ProductionTaskRuntime.list({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
  });
  const graphTasks = tasks.filter((candidate) =>
    String(candidate.production_graph_id) === String(task.production_graph_id),
  );
  const plannedCost = graphTasks.reduce(
    (sum, candidate) => sum + Math.max(0, finite(candidate.cost?.estimated) || 0),
    0,
  );
  if (plannedCost > ceiling + 0.000001) {
    throw new Error("PRODUCTION_DOSSIER_TASK_COST_CEILING_EXCEEDED");
  }

  return { graph, dossier, approval, ceiling, plannedCost };
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const dispatchWithoutDossierGate = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );
  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithProductionDossierGate(id) {
    const task = await ProductionTaskRuntime.get(id);
    if (!task) throw new Error("Production task not found");
    const evidence = await approvedDossier(task);
    const updated = await ProductionTaskRuntime.update(task.id, {
      cost: {
        ...(task.cost || {}),
        approved: true,
      },
      metadata: {
        ...(task.metadata || {}),
        production_dossier_asset_node_id: evidence.dossier.id,
        production_dossier_approval_record_asset_node_id: evidence.approval.id,
        approved_dossier_hash: evidence.dossier.metadata?.dossier_hash || null,
        approved_plan_hash: evidence.dossier.metadata?.plan_hash || null,
        approved_graph_hash: evidence.dossier.metadata?.graph_hash || null,
        approved_execution_hash: evidence.dossier.metadata?.execution_hash || null,
        approved_cost_ceiling: evidence.ceiling,
        production_dossier_gate_passed: true,
      },
    });
    return dispatchWithoutDossierGate(updated.id);
  };
}

install();

export const CreativeProductionDossierExecutionGate = {
  installed: true,
  approvedDossier,
};
