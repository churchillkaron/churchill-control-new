import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function runHeartbeat({
  worker_name,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("runtime_heartbeat")
      .upsert([
        {

          worker_name,

          last_seen:
            new Date().toISOString(),

          status:
            "ACTIVE",
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {

      success: true,

      heartbeat:
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
