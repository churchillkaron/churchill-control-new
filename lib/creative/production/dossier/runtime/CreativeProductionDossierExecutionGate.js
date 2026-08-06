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

const REPLACEMENT_SOURCE_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_SOURCE_V1";
const REPLACEMENT_REVIEW_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sameMoney(left, right) {
  const a = finite(left);
  const b = finite(right);
  return a !== null && b !== null && Math.abs(a - b) <= 0.000001;
}

function sha256(value) {
  return /^[a-f0-9]{64}$/i.test(text(value));
}

async function graphTasksFor(task = {}) {
  const tasks = await ProductionTaskRuntime.list({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
  });
  return tasks.filter((candidate) =>
    String(candidate.production_graph_id) === String(task.production_graph_id),
  );
}

function plannedCost(tasks = []) {
  return tasks.reduce(
    (sum, candidate) => sum + Math.max(0, finite(candidate.cost?.estimated) || 0),
    0,
  );
}

function supersessionReference(task = {}) {
  const sourceReplacement = text(task.metadata?.superseded_by_repair_task_id);
  const reviewReplacement = text(
    task.metadata?.superseded_by_repair_review_task_id,
  );

  if (sourceReplacement && reviewReplacement) {
    return {
      kind: "AMBIGUOUS",
      replacementTaskId: null,
    };
  }
  if (sourceReplacement) {
    return {
      kind: "SOURCE",
      replacementTaskId: sourceReplacement,
    };
  }
  if (reviewReplacement) {
    return {
      kind: "REVIEW",
      replacementTaskId: reviewReplacement,
    };
  }
  return null;
}

function supersessionEvidence(task = {}, taskMap = new Map()) {
  const reference = supersessionReference(task);
  if (!reference) {
    return {
      taskId: task.id,
      superseded: false,
      valid: false,
      kind: null,
      replacementTaskId: null,
      issues: [],
    };
  }

  const issues = [];
  const replacement = reference.replacementTaskId
    ? taskMap.get(reference.replacementTaskId)
    : null;

  if (reference.kind === "AMBIGUOUS") {
    issues.push("MULTIPLE_SUPERSESSION_REFERENCES");
  }
  if (text(task.status) !== "FAILED") {
    issues.push(`SUPERSEDED_TASK_STATUS_INVALID:${task.status}`);
  }
  if (!replacement) {
    issues.push("REPLACEMENT_TASK_MISSING");
  }

  if (replacement) {
    for (const key of [
      "organization_id",
      "creative_project_id",
      "production_graph_id",
    ]) {
      if (text(task[key]) !== text(replacement[key])) {
        issues.push(`REPLACEMENT_SCOPE_MISMATCH:${key}`);
      }
    }

    if (
      replacement.metadata?.pair_aware_repair !== true ||
      replacement.metadata?.generated_media_perceptual_pair_repair !== true
    ) {
      issues.push("REPLACEMENT_PAIR_REPAIR_CONTRACT_MISSING");
    }

    const originalRepairIdentity = text(task.metadata?.repair_identity);
    const replacementRepairIdentity = text(
      replacement.metadata?.repair_identity,
    );
    if (
      originalRepairIdentity &&
      originalRepairIdentity !== replacementRepairIdentity
    ) {
      issues.push("REPAIR_IDENTITY_MISMATCH");
    }

    const originalAttempt = finite(task.metadata?.repair_attempt);
    const replacementAttempt = finite(replacement.metadata?.repair_attempt);
    if (
      originalAttempt !== null &&
      originalAttempt > 0 &&
      originalAttempt !== replacementAttempt
    ) {
      issues.push("REPAIR_ATTEMPT_MISMATCH");
    }

    if (reference.kind === "SOURCE") {
      if (text(replacement.metadata?.repair_of_task_id) !== text(task.id)) {
        issues.push("SOURCE_REPLACEMENT_BACK_REFERENCE_INVALID");
      }
      if (
        text(replacement.metadata?.repair_payload_contract) !==
        REPLACEMENT_SOURCE_CONTRACT
      ) {
        issues.push("SOURCE_REPLACEMENT_PAYLOAD_CONTRACT_INVALID");
      }
    }

    if (reference.kind === "REVIEW") {
      if (
        text(replacement.metadata?.repair_review_of_task_id) !== text(task.id)
      ) {
        issues.push("REVIEW_REPLACEMENT_BACK_REFERENCE_INVALID");
      }
      if (
        text(replacement.metadata?.repair_payload_contract) !==
        REPLACEMENT_REVIEW_CONTRACT
      ) {
        issues.push("REVIEW_REPLACEMENT_PAYLOAD_CONTRACT_INVALID");
      }
      const repairedSourceTaskId = text(
        replacement.metadata?.repaired_source_task_id,
      );
      if (
        !repairedSourceTaskId ||
        list(replacement.depends_on).length !== 1 ||
        text(replacement.depends_on[0]) !== repairedSourceTaskId
      ) {
        issues.push("REVIEW_REPLACEMENT_DEPENDENCY_INVALID");
      }
      const repairedSource = repairedSourceTaskId
        ? taskMap.get(repairedSourceTaskId)
        : null;
      if (
        !repairedSource ||
        text(repairedSource.metadata?.repair_payload_contract) !==
          REPLACEMENT_SOURCE_CONTRACT ||
        text(repairedSource.metadata?.repair_quality_task_id) !== text(task.id)
      ) {
        issues.push("REVIEW_REPLACEMENT_SOURCE_PAIR_INVALID");
      }
    }
  }

  return {
    taskId: task.id,
    superseded: true,
    valid: issues.length === 0,
    kind: reference.kind,
    replacementTaskId: reference.replacementTaskId,
    replacementStatus: replacement?.status || null,
    issues,
  };
}

async function activeGraphTaskSet(task = {}) {
  const historicalTasks = await graphTasksFor(task);
  const taskMap = new Map(
    historicalTasks.map((candidate) => [String(candidate.id), candidate]),
  );
  const supersession = historicalTasks
    .map((candidate) => supersessionEvidence(candidate, taskMap))
    .filter((evidence) => evidence.superseded);
  const invalid = supersession.filter((evidence) => !evidence.valid);

  if (invalid.length) {
    const details = invalid
      .map((evidence) =>
        `${evidence.taskId}:${evidence.issues.join("+") || "INVALID"}`,
      )
      .join(",");
    throw new Error(`PRODUCTION_DOSSIER_SUPERSESSION_INVALID:${details}`);
  }

  const replacementReferences = new Map();
  for (const evidence of supersession) {
    const replacementTaskId = text(evidence.replacementTaskId);
    const references = replacementReferences.get(replacementTaskId) || [];
    references.push(evidence.taskId);
    replacementReferences.set(replacementTaskId, references);
  }
  const duplicateReferences = [...replacementReferences.entries()].filter(
    ([, references]) => references.length !== 1,
  );
  if (duplicateReferences.length) {
    const details = duplicateReferences
      .map(([replacementTaskId, references]) =>
        `${replacementTaskId}:${references.join("+")}`,
      )
      .join(",");
    throw new Error(
      `PRODUCTION_DOSSIER_SUPERSESSION_REPLACEMENT_NOT_UNIQUE:${details}`,
    );
  }

  const supersededTaskIds = new Set(
    supersession.map((evidence) => String(evidence.taskId)),
  );
  const activeTasks = historicalTasks.filter(
    (candidate) => !supersededTaskIds.has(String(candidate.id)),
  );

  return {
    historicalTasks,
    activeTasks,
    supersession,
    historicalTaskCount: historicalTasks.length,
    activeTaskCount: activeTasks.length,
    supersededTaskCount: supersession.length,
    supersededSourceCount: supersession.filter(
      (evidence) => evidence.kind === "SOURCE",
    ).length,
    supersededReviewCount: supersession.filter(
      (evidence) => evidence.kind === "REVIEW",
    ).length,
    historicalPlannedCost: plannedCost(historicalTasks),
    activePlannedCost: plannedCost(activeTasks),
  };
}

function sealedApprovalContract(value = {}) {
  const contract = object(value);
  return contract.contract ===
      "CREATIVE_SEALED_PRODUCTION_EXECUTION_APPROVAL_V1"
    ? contract
    : null;
}

async function approvedSealedDossier(task, graph) {
  const graphApproval = sealedApprovalContract(
    graph.metadata?.production_approval_contract,
  );
  if (!graphApproval) return null;

  const taskApproval = sealedApprovalContract(
    task.metadata?.production_approval_contract,
  );
  if (!taskApproval) {
    throw new Error("SEALED_PRODUCTION_TASK_APPROVAL_CONTRACT_REQUIRED");
  }

  if (!["APPROVED", "IN_PRODUCTION"].includes(text(graph.status))) {
    throw new Error("SEALED_PRODUCTION_GRAPH_APPROVAL_REQUIRED");
  }
  if (
    graphApproval.production_authorized !== true ||
    graphApproval.publication_authorized !== false ||
    taskApproval.production_authorized !== true ||
    taskApproval.publication_authorized !== false
  ) {
    throw new Error("SEALED_PRODUCTION_AUTHORIZATION_STATE_INVALID");
  }

  for (const key of [
    "manifest_sha256",
    "preproduction_gate_sha256",
    "graph_preview_sha256",
  ]) {
    if (
      !sha256(graphApproval[key]) ||
      text(graphApproval[key]) !== text(taskApproval[key])
    ) {
      throw new Error(
        `SEALED_PRODUCTION_${key.toUpperCase()}_MISMATCH`,
      );
    }
  }

  const graphReference = text(graph.metadata?.sealed_execution_reference);
  const taskReference = text(task.metadata?.sealed_execution_reference);
  if (!graphReference || graphReference !== taskReference) {
    throw new Error("SEALED_PRODUCTION_EXECUTION_REFERENCE_MISMATCH");
  }
  if (
    text(graph.metadata?.sealed_approval_manifest_sha256) &&
    text(graph.metadata?.sealed_approval_manifest_sha256) !==
      text(graphApproval.manifest_sha256)
  ) {
    throw new Error("SEALED_PRODUCTION_GRAPH_MANIFEST_HASH_MISMATCH");
  }

  const ceiling = finite(graphApproval.maximum_customer_price);
  if (ceiling === null || ceiling <= 0) {
    throw new Error("SEALED_PRODUCTION_APPROVED_COST_CEILING_REQUIRED");
  }
  if (text(graphApproval.currency).toUpperCase() !== "THB") {
    throw new Error("SEALED_PRODUCTION_APPROVAL_CURRENCY_INVALID");
  }
  if (!sameMoney(taskApproval.maximum_customer_price, ceiling)) {
    throw new Error("SEALED_PRODUCTION_TASK_APPROVAL_CEILING_MISMATCH");
  }

  const costPlan = object(graph.cost_plan);
  const estimated = finite(costPlan.estimated_cost);
  if (
    costPlan.approval_required !== true ||
    costPlan.approved !== true ||
    !sameMoney(costPlan.approved_cost, ceiling) ||
    !sameMoney(costPlan.maximum_customer_price, ceiling)
  ) {
    throw new Error("SEALED_PRODUCTION_GRAPH_COST_APPROVAL_REQUIRED");
  }
  if (estimated === null || estimated < 0 || estimated > ceiling + 0.000001) {
    throw new Error("SEALED_PRODUCTION_GRAPH_COST_CEILING_EXCEEDED");
  }

  const guard = object(
    task.metadata?.approved_cost_guard || task.input?.approved_cost_guard,
  );
  const taskMaximum = finite(guard.maximum_customer_price);
  if (
    taskMaximum === null ||
    taskMaximum <= 0 ||
    taskMaximum > ceiling + 0.000001 ||
    text(guard.currency).toUpperCase() !== "THB" ||
    !text(guard.reference)
  ) {
    throw new Error("SEALED_PRODUCTION_TASK_COST_GUARD_INVALID");
  }

  const taskSet = await activeGraphTaskSet(task);
  const expectedTaskCount = finite(graph.metadata?.task_count);
  if (
    expectedTaskCount !== null &&
    expectedTaskCount > 0 &&
    taskSet.activeTaskCount !== expectedTaskCount
  ) {
    throw new Error("SEALED_PRODUCTION_TASK_COUNT_MISMATCH");
  }
  if (taskSet.activePlannedCost > ceiling + 0.000001) {
    throw new Error("SEALED_PRODUCTION_TASK_COST_CEILING_EXCEEDED");
  }

  return {
    mode: "SEALED_PREPRODUCTION_GATE",
    graph,
    dossier: null,
    approval: null,
    ceiling,
    plannedCost: taskSet.activePlannedCost,
    historicalPlannedCost: taskSet.historicalPlannedCost,
    historicalTaskCount: taskSet.historicalTaskCount,
    activeTaskCount: taskSet.activeTaskCount,
    supersededTaskCount: taskSet.supersededTaskCount,
    supersededSourceCount: taskSet.supersededSourceCount,
    supersededReviewCount: taskSet.supersededReviewCount,
    supersession: taskSet.supersession,
    manifestHash: graphApproval.manifest_sha256,
    preproductionGateHash: graphApproval.preproduction_gate_sha256,
    graphPreviewHash: graphApproval.graph_preview_sha256,
  };
}

async function approvedLegacyDossier(task, graph) {
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
  if (
    dossier.review?.human_reviewed !== true ||
    dossier.review?.approved !== true
  ) {
    throw new Error("PRODUCTION_DOSSIER_HUMAN_APPROVAL_REQUIRED");
  }

  const approval = await CreativeApprovalRuntime.findCurrentApproval({
    organization_id: task.organization_id,
    subject_asset_node_id: dossier.id,
    scope: "PRODUCTION_DOSSIER",
  });
  if (!approval) throw new Error("CURRENT_PRODUCTION_DOSSIER_APPROVAL_REQUIRED");

  const comparisons = [
    [
      "dossier",
      dossier.metadata?.dossier_hash,
      graph.metadata?.approved_dossier_hash,
    ],
    ["plan", dossier.metadata?.plan_hash, graph.metadata?.approved_plan_hash],
    ["graph", dossier.metadata?.graph_hash, graph.metadata?.approved_graph_hash],
    [
      "execution",
      dossier.metadata?.execution_hash,
      graph.metadata?.approved_execution_hash,
    ],
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

  const taskSet = await activeGraphTaskSet(task);
  if (taskSet.activePlannedCost > ceiling + 0.000001) {
    throw new Error("PRODUCTION_DOSSIER_TASK_COST_CEILING_EXCEEDED");
  }

  return {
    mode: "LEGACY_PRODUCTION_DOSSIER",
    graph,
    dossier,
    approval,
    ceiling,
    plannedCost: taskSet.activePlannedCost,
    historicalPlannedCost: taskSet.historicalPlannedCost,
    historicalTaskCount: taskSet.historicalTaskCount,
    activeTaskCount: taskSet.activeTaskCount,
    supersededTaskCount: taskSet.supersededTaskCount,
    supersededSourceCount: taskSet.supersededSourceCount,
    supersededReviewCount: taskSet.supersededReviewCount,
    supersession: taskSet.supersession,
  };
}

async function approvedDossier(task = {}) {
  if (!task.production_graph_id) {
    throw new Error("PRODUCTION_DOSSIER_GRAPH_ID_REQUIRED");
  }
  const graph = await ProductionGraphRepository.getById(task.production_graph_id);
  if (!graph || String(graph.organization_id) !== String(task.organization_id)) {
    throw new Error("PRODUCTION_DOSSIER_GRAPH_NOT_FOUND");
  }

  const sealed = await approvedSealedDossier(task, graph);
  if (sealed) return sealed;
  return approvedLegacyDossier(task, graph);
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
    const sealedMode = evidence.mode === "SEALED_PREPRODUCTION_GATE";
    const updated = await ProductionTaskRuntime.update(task.id, {
      cost: {
        ...(task.cost || {}),
        approved: true,
      },
      metadata: {
        ...(task.metadata || {}),
        production_dossier_mode: evidence.mode,
        production_dossier_asset_node_id: evidence.dossier?.id || null,
        production_dossier_approval_record_asset_node_id:
          evidence.approval?.id || null,
        approved_dossier_hash:
          evidence.dossier?.metadata?.dossier_hash || null,
        approved_plan_hash: evidence.dossier?.metadata?.plan_hash || null,
        approved_graph_hash:
          evidence.dossier?.metadata?.graph_hash ||
          evidence.graphPreviewHash ||
          null,
        approved_execution_hash:
          evidence.dossier?.metadata?.execution_hash ||
          evidence.preproductionGateHash ||
          null,
        approved_manifest_hash: evidence.manifestHash || null,
        approved_cost_ceiling: evidence.ceiling,
        historical_production_task_count:
          evidence.historicalTaskCount ?? null,
        active_production_task_count: evidence.activeTaskCount ?? null,
        superseded_production_task_count:
          evidence.supersededTaskCount ?? null,
        superseded_production_source_count:
          evidence.supersededSourceCount ?? null,
        superseded_production_review_count:
          evidence.supersededReviewCount ?? null,
        active_production_planned_cost: evidence.plannedCost,
        production_dossier_gate_passed: true,
        sealed_preproduction_gate_passed: sealedMode,
      },
    });
    return dispatchWithoutDossierGate(updated.id);
  };
}

install();

export const CreativeProductionDossierExecutionGate = {
  installed: true,
  graphTasksFor,
  supersessionReference,
  supersessionEvidence,
  activeGraphTaskSet,
  approvedDossier,
  approvedSealedDossier,
  approvedLegacyDossier,
};
