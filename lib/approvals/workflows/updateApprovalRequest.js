import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function processApproval({
  request_id,
  approved_by,
  decision,
}) {

  try {

    const status =
      decision === "approve"
        ? "approved"
        : "rejected";

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("approval_requests")
      .update({
        status,
        approved_by,
        approved_at:
          new Date().toISOString(),
      })
      .eq("id", request_id)
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
