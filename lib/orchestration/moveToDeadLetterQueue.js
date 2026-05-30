import { supabase } from "@/lib/supabase";

export async function moveToDeadLetterQueue({
  tenantId,
  orchestrationType,
  referenceId,
  failedStep,
  errorMessage,
}) {
  const { data, error } =
    await supabase
      .from(
        "orchestration_dead_letter_queue"
      )
      .insert({
        tenant_id: tenantId,
        orchestration_type:
          orchestrationType,
        reference_id:
          referenceId,
        failed_step:
          failedStep,
        error_message:
          errorMessage,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
