export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  claimSecretaryAppointmentNotification,
  materializeSecretaryAppointmentReminders,
  processSecretaryAppointmentNotification,
} from "@/lib/operator/secretary/SecretaryAppointmentNotificationRuntime";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 8, 20));
    const workerId = `secretary-appointment-notification:${crypto.randomUUID()}`;
    const materialized = await materializeSecretaryAppointmentReminders({ now: new Date() });
    const results = [];

    for (let index = 0; index < limit; index += 1) {
      const notification = await claimSecretaryAppointmentNotification({
        workerId,
        leaseSeconds: 180,
      });
      if (!notification) break;

      try {
        const result = await processSecretaryAppointmentNotification(notification);
        results.push({
          notification_id: notification.id,
          notification_kind: notification.notification_kind,
          status: result.status,
          reason: result.reason || null,
          message_id: result.message?.id || result.notification?.message_id || null,
        });
      } catch (error) {
        const currentAttempt = Math.max(1, Number(notification.attempt_count || 1));
        const exhausted = currentAttempt >= Number(notification.max_attempts || 4);
        const retryAt = new Date(
          Date.now() + Math.min(300, 15 * 2 ** Math.min(currentAttempt, 5)) * 1000,
        ).toISOString();
        const { error: updateError } = await import("@/lib/shared/supabase/admin").then(
          async ({ supabaseAdmin }) =>
            supabaseAdmin
              .from("secretary_appointment_notifications")
              .update({
                status: exhausted ? "SKIPPED" : "FAILED",
                available_at: retryAt,
                lease_token: null,
                lease_expires_at: null,
                last_error: String(error?.message || error || "Appointment notification failed").slice(0, 2000),
                updated_at: new Date().toISOString(),
              })
              .eq("id", notification.id),
        );
        if (updateError) {
          console.error("SECRETARY_APPOINTMENT_NOTIFICATION_FAILURE_STATE_FAILED", updateError.message || updateError);
        }
        results.push({
          notification_id: notification.id,
          notification_kind: notification.notification_kind,
          status: exhausted ? "skipped" : "failed",
          error: String(error?.message || error || "Appointment notification failed").slice(0, 500),
        });
      }
    }

    const failedCount = results.filter((item) => item.status === "failed").length;
    return Response.json(
      {
        success: failedCount === 0,
        contract: "AVANTIQO_SECRETARY_APPOINTMENT_NOTIFICATION_PROCESS_V1",
        materialized,
        processed_count: results.length,
        failed_count: failedCount,
        results,
        external_authority_used: false,
      },
      {
        status: failedCount > 0 ? 207 : 200,
        headers: { "Cache-Control": "no-store, private" },
      },
    );
  } catch (error) {
    console.error("SECRETARY_APPOINTMENT_NOTIFICATION_PROCESS_FAILED", error?.message || error);
    return Response.json(
      {
        success: false,
        error: error?.message || "Secretary appointment notification process failed",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
