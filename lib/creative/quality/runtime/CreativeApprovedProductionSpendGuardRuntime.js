import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  ProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";

const CONTRACT = "CREATIVE_APPROVED_PRODUCTION_SPEND_GUARD_V1";
const SEALED_APPROVAL_CONTRACT =
  "CREATIVE_SEALED_PRODUCTION_EXECUTION_APPROVAL_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function money(value) {
  const number = finite(value);
  return number !== null && number >= 0 ? number : 0;
}

function sealedApproval(graph = {}) {
  const approval = object(graph.metadata?.production_approval_contract);
  return approval.contract === SEALED_APPROVAL_CONTRACT ? approval : null;
}

function taskSettlement(task = {}) {
  const mirrored = object(task.metadata?.service_settlement);
  const amount = finite(
    mirrored.charged_amount ??
    task.cost?.actual ??
    task.output?.wallet_settlement?.charged_amount ??
    task.output?.usage?.customer_price ??
    task.output?.pricing?.customer_price,
  );
  const usageId = text(
    mirrored.usage_id ||
    task.output?.usage?.id ||
    task.output?.provider_submission?.usage?.id,
  );
  return {
    amount: amount !== null && amount > 0 ? amount : 0,
    usage_id: usageId || null,
  };
}

function uniqueSettledSpend(tasks = []) {
  const seen = new Set();
  let total = 0;
  const entries = [];

  for (const task of tasks) {
    const settlement = taskSettlement(task);
    if (settlement.amount <= 0) continue;
    const key = settlement.usage_id || `task:${task.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += settlement.amount;
    entries.push({
      task_id: task.id,
      usage_id: settlement.usage_id,
      charged_amount: settlement.amount,
      superseded: Boolean(
        task.metadata?.superseded_by_repair_task_id ||
        task.metadata?.superseded_by_repair_review_task_id,
      ),
    });
  }

  return {
    charged_total: Number(total.toFixed(6)),
    charged_entries: entries,
  };
}

export async function creativeApprovedProductionSpendSummary({
  organization_id,
  creative_project_id,
  production_graph_id,
} = {}) {
  if (!organization_id || !creative_project_id || !production_graph_id) {
    throw new Error("CREATIVE_APPROVED_SPEND_SCOPE_REQUIRED");
  }

  const [graph, tasks] = await Promise.all([
    ProductionGraphRuntime.get(production_graph_id),
    ProductionTaskRuntime.list({
      organization_id,
      creative_project_id,
      production_graph_id,
    }),
  ]);

  if (!graph || text(graph.organization_id) !== text(organization_id)) {
    throw new Error("CREATIVE_APPROVED_SPEND_GRAPH_NOT_FOUND");
  }
  if (text(graph.creative_project_id) !== text(creative_project_id)) {
    throw new Error("CREATIVE_APPROVED_SPEND_GRAPH_PROJECT_MISMATCH");
  }

  const approval = sealedApproval(graph);
  if (!approval) {
    return {
      contract: CONTRACT,
      governed: false,
      mode: "NO_SEALED_PRODUCTION_APPROVAL",
      production_graph_id,
      approved_ceiling: null,
      currency: null,
      charged_total: uniqueSettledSpend(tasks).charged_total,
      remaining_approved_headroom: null,
      task_count: tasks.length,
    };
  }

  const ceiling = finite(approval.maximum_customer_price);
  const currency = text(approval.currency).toUpperCase();
  if (ceiling === null || ceiling <= 0 || !currency) {
    throw new Error("CREATIVE_APPROVED_SPEND_CEILING_INVALID");
  }

  const settled = uniqueSettledSpend(tasks);
  const remaining = Math.max(0, ceiling - settled.charged_total);

  return {
    contract: CONTRACT,
    governed: true,
    mode: "SEALED_APPROVED_TOTAL_SPEND",
    production_graph_id,
    approved_ceiling: ceiling,
    currency,
    charged_total: settled.charged_total,
    remaining_approved_headroom: Number(remaining.toFixed(6)),
    task_count: tasks.length,
    charged_entries: settled.charged_entries,
  };
}

export async function assertCreativeAdditionalProductionSpendAllowed({
  source_task = {},
  projected_cost = null,
} = {}) {
  if (!source_task?.organization_id || !source_task?.creative_project_id) {
    throw new Error("CREATIVE_REPAIR_SOURCE_SCOPE_REQUIRED");
  }
  if (!source_task?.production_graph_id) {
    return {
      contract: CONTRACT,
      governed: false,
      mode: "NO_PRODUCTION_GRAPH",
      projected_cost: money(projected_cost),
      allowed: true,
    };
  }

  const projected = finite(projected_cost ?? source_task.cost?.estimated);
  if (projected === null || projected < 0) {
    throw new Error("CREATIVE_ADDITIONAL_SPEND_PROJECTION_REQUIRED");
  }

  const summary = await creativeApprovedProductionSpendSummary({
    organization_id: source_task.organization_id,
    creative_project_id: source_task.creative_project_id,
    production_graph_id: source_task.production_graph_id,
  });

  if (!summary.governed) {
    return {
      ...summary,
      projected_cost: projected,
      allowed: true,
    };
  }

  const projectedTotal = Number((summary.charged_total + projected).toFixed(6));
  if (projectedTotal > summary.approved_ceiling + 0.000001) {
    throw new Error(
      `CREATIVE_AUTONOMOUS_REPAIR_APPROVED_SPEND_CEILING_EXCEEDED:${summary.charged_total}:${projected}:${summary.approved_ceiling}`,
    );
  }

  return {
    ...summary,
    projected_cost: projected,
    projected_total_spend: projectedTotal,
    remaining_after_projection: Number(
      (summary.approved_ceiling - projectedTotal).toFixed(6),
    ),
    allowed: true,
  };
}

export const CreativeApprovedProductionSpendGuardRuntime = Object.freeze({
  contract: CONTRACT,
  summary: creativeApprovedProductionSpendSummary,
  assertAdditionalSpendAllowed: assertCreativeAdditionalProductionSpendAllowed,
});
