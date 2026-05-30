import { supabase } from "@/lib/supabase";

import { executeAccountingWorkflow } from "./executeAccountingWorkflow";

export async function runScheduledJob({
  tenantId,
  jobId,
}) {
  const { data: job, error } =
    await supabase
      .from(
        "accounting_scheduler_jobs"
      )
      .select("*")
      .eq("id", jobId)
      .single();

  if (error || !job) {
    throw new Error(
      "Scheduler job not found"
    );
  }

  const result =
    await executeAccountingWorkflow({
      tenantId,
      workflowType:
        job.job_type,
    });

  await supabase
    .from(
      "accounting_scheduler_jobs"
    )
    .update({
      last_run_at:
        new Date().toISOString(),
    })
    .eq("id", jobId);

  const {
    data: log,
    error: logError,
  } = await supabase
    .from(
      "accounting_scheduler_logs"
    )
    .insert({
      tenant_id: tenantId,
      job_id: jobId,
      execution_status:
        "completed",
      execution_result:
        result,
    })
    .select()
    .single();

  if (logError) {
    throw logError;
  }

  return {
    job,
    result,
    log,
  };
}
