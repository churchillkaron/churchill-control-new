import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createAuditRecord({
  tenant_id,
  action_type,
  execution_result,
  metadata = {},
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("governance_audit")
      .insert([
        {

          tenant_id,

          action_type,

          execution_result,

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

      audit:
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
