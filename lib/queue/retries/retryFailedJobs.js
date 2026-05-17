import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function retryFailedJobs() {

  const {
    data: jobs,
    error,
  } = await supabaseAdmin
    .from("queue_jobs")
    .select("*")
    .eq("status", "failed")
    .limit(25);

  if (error) {
    throw error;
  }

  const retried = [];

  for (const job of jobs || []) {

    await supabaseAdmin
      .from("queue_jobs")
      .update({
        status: "pending",
        error_message: null,
      })
      .eq("id", job.id);

    retried.push(job.id);
  }

  return {
    success: true,
    retried_count:
      retried.length,
    retried,
  };
}
