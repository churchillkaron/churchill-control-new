import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function logAuditEvent({

  tenant_id,

  performed_by = null,

  performed_by_name = "SYSTEM",

  action_type,

  entity_type,

  entity_id = null,

  old_data = null,

  new_data = null,

  metadata = {},

}) {

  try {

    if (!tenant_id) {

      console.error(
        "AUDIT_LOG_MISSING_TENANT"
      );

      return {
        success: false,
        error:
          "Missing tenant_id",
      };

    }

    const { error } =
      await supabaseAdmin
        .from("audit_logs")
        .insert([
          {

            tenant_id,

            entity_type,

            entity_id,

            action_type,

            performed_by,

            performed_by_name,

            old_data,

            new_data,

            metadata,

            created_at:
              new Date().toISOString(),

          },
        ]);

    if (error) {

      console.error(
        "AUDIT_LOG_ERROR",
        error.message
      );

    }

    return {

      success:
        !error,

      error:
        error?.message || null,

    };

  } catch (error) {

    console.error(
      "AUDIT_LOG_FATAL",
      error.message
    );

    return {

      success: false,

      error:
        error.message,

    };

  }

}
