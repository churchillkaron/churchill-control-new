import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function createAlert({
  tenantId,
  alertType,
  severity = "INFO",
  title,
  message,
  source,
  sourceId,
}) {

  try {

    const { error } =
      await supabaseAdmin
        .from("system_alerts")
        .insert({

          tenant_id:
            tenantId,

          alert_type:
            alertType,

          severity,

          title,

          message,

          source,

          source_id:
            sourceId,

        });

    if (error) {

      console.error(
        "CREATE ALERT ERROR:",
        error
      );

    }

  } catch (err) {

    console.error(
      "ALERT ENGINE ERROR:",
      err
    );

  }

}
