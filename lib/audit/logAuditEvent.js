import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function logAuditEvent({
  tenant_id,
  user_id,
  action,
  entity_type,
  entity_id,
  metadata = {},
}) {
  try {
    const { error } = await supabaseAdmin
      .from("audit_logs")
      .insert([
        {
          tenant_id,
          user_id,
          action,
          entity_type,
          entity_id,
          metadata,
          created_at: new Date().toISOString(),
        },
      ]);

    if (error) {
      console.error("AUDIT_LOG_ERROR", error.message);
    }

    return {
      success: !error,
      error: error?.message || null,
    };
  } catch (error) {
    console.error("AUDIT_LOG_FATAL", error.message);

    return {
      success: false,
      error: error.message,
    };
  }
}
