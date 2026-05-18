import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function addJobToQueue({
  tenant_id,
  job_type,
  payload = {},
  priority = "NORMAL",
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("distributed_jobs")
      .insert([
        {

          tenant_id,

          job_type,

          payload,

          priority,

          status:
            "PENDING",

          created_at:
            new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {

      success: true,

      job:
        data,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
