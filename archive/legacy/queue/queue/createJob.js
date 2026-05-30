import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createJob({
  tenant_id,
  type,
  payload = {},
  priority = "normal",
}) {
  try {
    const { data, error } = await supabaseAdmin
      .from("queue_jobs")
      .insert([
        {
          tenant_id,
          type,
          payload,
          priority,
          status: "pending",
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      job: data,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
