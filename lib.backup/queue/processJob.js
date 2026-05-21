import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function processJob(job) {
  try {
    await supabaseAdmin
      .from("queue_jobs")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    console.log("PROCESSING_JOB", job.type);

    await supabaseAdmin
      .from("queue_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return {
      success: true,
    };
  } catch (error) {
    await supabaseAdmin
      .from("queue_jobs")
      .update({
        status: "failed",
        error_message: error.message,
      })
      .eq("id", job.id);

    return {
      success: false,
      error: error.message,
    };
  }
}
