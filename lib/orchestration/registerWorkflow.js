import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function registerWorkflow({
  organizationId,
  workflowName,
  workflowType,
  workflowDefinition = {},
  triggerEvent = null,
  createdBy = null,
  active = true,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!workflowName) {
    throw new Error("workflowName required");
  }

  if (!workflowType) {
    throw new Error("workflowType required");
  }

  const definition =
    workflowDefinition && typeof workflowDefinition === "object"
      ? workflowDefinition
      : {};

  const resolvedTriggerEvent =
    triggerEvent ||
    definition.trigger_event ||
    definition.triggerEvent ||
    null;

  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("enterprise_workflows")
    .insert({
      organization_id: organizationId,
      workflow_name: workflowName,
      workflow_type: workflowType,
      workflow_status: active ? "ACTIVE" : "INACTIVE",
      trigger_event: resolvedTriggerEvent,
      workflow_definition: definition,
      active: Boolean(active),
      created_by: createdBy,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}
