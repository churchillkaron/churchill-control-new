import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizedSteps(workflowDefinition = {}) {
  const steps = Array.isArray(workflowDefinition?.steps)
    ? workflowDefinition.steps
    : [];

  return steps
    .map((step, index) => {
      const capability = object(step?.capability);
      const actionConfig = {
        ...object(step?.action_config),
        domain: text(step?.domain || capability.domain),
        capability: text(step?.capability_name || capability.capability),
        action: text(step?.action || capability.action),
        payload: object(step?.payload || step?.action_config?.payload),
      };

      if (!actionConfig.domain || !actionConfig.capability || !actionConfig.action) {
        throw new Error(`Workflow step ${index + 1} is missing a UBTE capability reference`);
      }

      return {
        step_name:
          text(step?.name || step?.step_name || step?.description) ||
          `Step ${index + 1}`,
        step_order: index + 1,
        step_type: "CAPABILITY",
        action_type: "UBTE_CAPABILITY",
        action_config: actionConfig,
        retry_limit: Math.max(0, Math.min(Number(step?.retry_limit ?? 2), 5)),
        timeout_seconds: Math.max(5, Math.min(Number(step?.timeout_seconds ?? 60), 900)),
        active: step?.active !== false,
      };
    });
}

export async function registerWorkflow({
  organizationId,
  workflowName,
  workflowType,
  workflowDefinition = {},
  triggerEvent = null,
  createdBy = null,
  active = true,
  nextRunAt = null,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!workflowName) throw new Error("workflowName required");
  if (!workflowType) throw new Error("workflowType required");

  const definition = object(workflowDefinition);
  const steps = normalizedSteps(definition);
  const resolvedTriggerEvent =
    triggerEvent ||
    definition.trigger_event ||
    definition.triggerEvent ||
    definition.trigger?.event ||
    null;
  const now = new Date().toISOString();

  const { data: workflow, error: workflowError } = await supabaseAdmin
    .from("enterprise_workflows")
    .insert({
      organization_id: organizationId,
      workflow_name: workflowName,
      workflow_type: workflowType,
      workflow_status: active ? "ACTIVE" : "INACTIVE",
      trigger_event: resolvedTriggerEvent,
      workflow_definition: definition,
      next_run_at: nextRunAt || definition.next_run_at || null,
      active: Boolean(active),
      created_by: createdBy,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (workflowError) throw workflowError;

  try {
    if (steps.length) {
      const { error: stepsError } = await supabaseAdmin
        .from("enterprise_workflow_steps")
        .insert(
          steps.map((step) => ({
            ...step,
            organization_id: organizationId,
            enterprise_workflow_id: workflow.id,
            created_at: now,
            updated_at: now,
          })),
        );

      if (stepsError) throw stepsError;
    }
  } catch (error) {
    await supabaseAdmin
      .from("enterprise_workflows")
      .delete()
      .eq("organization_id", organizationId)
      .eq("id", workflow.id);
    throw error;
  }

  return {
    ...workflow,
    steps,
  };
}
