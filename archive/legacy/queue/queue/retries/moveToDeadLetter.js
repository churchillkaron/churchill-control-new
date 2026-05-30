import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function moveToDeadLetter(
  job
) {

  await supabaseAdmin
    .from("dead_letter_jobs")
    .insert([
      {
        original_job_id:
          job.id,
        payload:
          job.payload,
        type:
          job.type,
        failed_at:
          new Date().toISOString(),
      },
    ]);

  await supabaseAdmin
    .from("queue_jobs")
    .delete()
    .eq("id", job.id);

  return {
    success: true,
    moved:
      job.id,
  };
}
