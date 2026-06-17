import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export async function recordSystemEvent({
  tenantId,
  type,
  payload = {},
}) {
  if (!type) {
    return {
      success: false,
      error: "type required",
    };
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("system_events")
    .insert({
      tenant_id: tenantId || null,
      type,
      payload,
    })
    .select()
    .single();

  if (error) {
    console.error(
      "[SYSTEM_EVENT_ERROR]",
      error.message
    );

    return {
      success: false,
      error: error.message,
    };
  }

  return {
    success: true,
    event: data,
  };
}
