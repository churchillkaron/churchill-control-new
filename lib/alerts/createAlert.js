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

  console.log(
    "CREATE ALERT FUNCTION CALLED"
  );

  try {

    console.log(
      "CREATING ALERT:",
      title
    );

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

      return {
        success: false,
        error,
      };

    }

    console.log(
      "ALERT CREATED"
    );

    return {
      success: true,
    };

  } catch (err) {

    console.error(
      "ALERT ENGINE ERROR:",
      err
    );

    return {
      success: false,
      error: err,
    };

  }

}