import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function requestApproval({
  tenant_id,
  action_type,
  payload = {},
  risk_level,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("governance_approvals")
      .insert([
        {

          tenant_id,

          action_type,

          payload,

          risk_level,

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

      approval:
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
