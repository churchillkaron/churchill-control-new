import { listDueServicePlans } from "../repositories/ServicePlanRepository";
import { reconcileGeneratedServiceOccurrences } from "./ServiceCompletionReconciliationRuntime";
import { generateNextServiceVisit } from "./ServicePlanRuntime";

function boundedLimit(value) {
  return Math.max(1, Math.min(Number(value) || 50, 200));
}

export async function processDueServicePlans({
  dueBefore = new Date().toISOString(),
  limit = 50,
} = {}) {
  const bounded = boundedLimit(limit);
  const completionReconciliation = await reconcileGeneratedServiceOccurrences({
    limit: bounded,
  });
  const plans = await listDueServicePlans({
    dueBefore,
    limit: bounded,
  });

  const results = [];

  for (const plan of plans) {
    try {
      const result = await generateNextServiceVisit({
        context: {
          organization_id: plan.organization_id,
          entity_id: plan.entity_id || null,
          actor_id: null,
          permissions: [],
          system_automation: true,
        },
        planId: plan.id,
      });

      results.push({
        success: true,
        organization_id: plan.organization_id,
        entity_id: plan.entity_id || null,
        service_plan_id: plan.id,
        generated: Boolean(result.generated),
        idempotent_replay: Boolean(result.idempotent_replay),
        recovered_plan_cursor: Boolean(result.recovered_plan_cursor),
        reason: result.reason || null,
        work_order_id: result.work_order?.id || result.occurrence?.work_order_id || null,
        next_service_at: result.plan?.next_service_at || null,
        plan_status: result.plan?.status || plan.status,
      });
    } catch (error) {
      results.push({
        success: false,
        organization_id: plan.organization_id,
        entity_id: plan.entity_id || null,
        service_plan_id: plan.id,
        error: error?.message || "SERVICE_PLAN_SCHEDULER_FAILED",
      });
    }
  }

  const generationFailed = results.filter((row) => !row.success).length;
  const failed = generationFailed + completionReconciliation.failed;

  return {
    success: failed === 0,
    due_before: dueBefore,
    selected: plans.length,
    processed: results.filter((row) => row.success).length,
    failed,
    generation_failed: generationFailed,
    generated: results.filter((row) => row.success && row.generated).length,
    recovered: results.filter((row) => row.success && row.recovered_plan_cursor).length,
    completed_occurrences_reconciled: completionReconciliation.reconciled,
    completion_reconciliation: completionReconciliation,
    results,
  };
}

export default processDueServicePlans;
