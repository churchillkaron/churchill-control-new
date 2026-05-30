import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createTraceRecord({
  tenant_id,
  actor,
  action_type,
  signature,
  authority_result,
  metadata = {},
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("trust_traceability")
      .insert([
        {

          tenant_id,

          actor,

          action_type,

          signature,

          authority_result,

          metadata,

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

      trace:
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
