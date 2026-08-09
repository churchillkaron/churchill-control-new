import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function moveToDeadLetterQueue({
  organizationId,
  orchestrationType,
  referenceId = null,
  failedStep = null,
  errorMessage = null,
  payload = {},
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!orchestrationType) {
    throw new Error("orchestrationType required");
  }

  const { data, error } = await supabaseAdmin
    .from("workflow_logs")
    .insert({
      organization_id: organizationId,
      event: orchestrationType,
      workflow: orchestrationType,
      status: "FAILED",
      payload: {
        ...(payload && typeof payload === "object" ? payload : {}),
        reference_id: referenceId,
        failed_step: failedStep,
      },
      error: errorMessage,
      workflow_execution_key:
        referenceId ? String(referenceId) : null,
      retry_count: 0,
      dead_letter: true,
      replayable: true,
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}
