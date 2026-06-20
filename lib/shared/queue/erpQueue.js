import { supabaseAdmin } from "@/lib/shared/supabase/admin";

/**
 * PERSISTENT ERP QUEUE
 * Survives restarts, crashes, scaling
 */

export async function addJob(job) {

  await supabaseAdmin
    .from("system_jobs")
    .insert({
      tenant_id: job.tenantId,
      type: job.type || "GENERIC",
      payload: job.payload
    });

}

/**
 * Worker runner (call via cron or interval worker)
 */
export async function processJobs() {

  const { data: jobs } = await supabaseAdmin
    .from("system_jobs")
    .select("*")
    .eq("status", "PENDING")
    .limit(50);

  for (const job of jobs || []) {

    try {

      await supabaseAdmin
        .from("system_jobs")
        .update({
          status: "PROCESSING",
          attempts: job.attempts + 1
        })
        .eq("id", job.id);

      await executeJob(job);

      await supabaseAdmin
        .from("system_jobs")
        .update({
          status: "DONE"
        })
        .eq("id", job.id);

    } catch (err) {

      await supabaseAdmin
        .from("system_jobs")
        .update({
          status: job.attempts + 1 >= job.max_attempts
            ? "FAILED"
            : "PENDING",
          last_error: err.message
        })
        .eq("id", job.id);

    }

  }
}

/**
 * Map job types to logic
 */
async function executeJob(job) {

  const payload = job.payload;

  switch (job.type) {

    default:
      throw new Error("Unknown job type");

  }
}
