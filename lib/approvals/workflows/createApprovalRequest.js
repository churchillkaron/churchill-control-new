import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createApprovalRequest({
  tenant_id,
  type,
  entity_id,
  requested_by,
  metadata = {},
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("approval_requests")
      .insert([
        {
          tenant_id,
          type,
          entity_id,
          requested_by,
          metadata,
          status: "pending",
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
      request: data,
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
