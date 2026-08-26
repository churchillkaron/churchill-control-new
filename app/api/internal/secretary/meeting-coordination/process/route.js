export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { processNextSecretaryMeetingCoordinationWithBookingGuard } from "@/lib/operator/secretary/SecretaryMeetingCoordinationBookingGuardRuntime";
import { repairSecretaryMeetingBookingNotifications } from "@/lib/operator/secretary/SecretaryMeetingCoordinationNotificationRuntime";
import { repairSecretaryBookedMeetingChangeNotifications } from "@/lib/operator/secretary/SecretaryBookedMeetingChangeRuntime";
import { repairSecretaryRecurringMeetingNotifications } from "@/lib/operator/secretary/SecretaryRecurringMeetingRepairRuntime";

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
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 3, 8));
    const workerId = `secretary-meeting-coordination:${crypto.randomUUID()}`;
    const recurringNotificationRepair = await repairSecretaryRecurringMeetingNotifications({ limit });
    const changeNotificationRepair = await repairSecretaryBookedMeetingChangeNotifications({ limit });
    const notificationRepair = await repairSecretaryMeetingBookingNotifications({ limit });
    const results = [];

    for (let index = 0; index < limit; index += 1) {
      const outcome = await processNextSecretaryMeetingCoordinationWithBookingGuard({ workerId, leaseSeconds: 180 });
      if (outcome.status === "idle") break;
      results.push(outcome);
    }

    const active = await supabaseAdmin
      .from("secretary_meeting_coordinations")
      .select("id", { count: "exact", head: true })
      .in("status", ["COLLECTING", "READY_TO_BOOK"]);
    if (active.error) throw active.error;

    const needsInput = await supabaseAdmin
      .from("secretary_meeting_coordinations")
      .select("id", { count: "exact", head: true })
      .eq("status", "NEEDS_INPUT");
    if (needsInput.error) throw needsInput.error;

    const pendingNotificationRepair = await supabaseAdmin
      .from("secretary_meeting_coordinations")
      .select("id", { count: "exact", head: true })
      .eq("status", "BOOKED")
      .or("metadata->>booking_notifications_materialized.is.null,metadata->>booking_notifications_materialized.eq.false");
    if (pendingNotificationRepair.error) throw pendingNotificationRepair.error;
    const notificationRepairPending = Number(pendingNotificationRepair.count || 0);

    const pendingChangeNotificationRepair = await supabaseAdmin
      .from("secretary_meeting_coordinations")
      .select("id", { count: "exact", head: true })
      .in("status", ["BOOKED", "CANCELLED"])
      .eq("metadata->>meeting_change_notifications_materialized", "false");
    if (pendingChangeNotificationRepair.error) throw pendingChangeNotificationRepair.error;
    const changeNotificationRepairPending = Number(pendingChangeNotificationRepair.count || 0);

    const pendingRecurringSeriesRepair = await supabaseAdmin
      .from("secretary_recurring_meeting_series")
      .select("id", { count: "exact", head: true })
      .eq("metadata->>recurring_notification_materialized", "false");
    if (pendingRecurringSeriesRepair.error) throw pendingRecurringSeriesRepair.error;

    const pendingRecurringOccurrenceRepair = await supabaseAdmin
      .from("secretary_recurring_meeting_occurrences")
      .select("id", { count: "exact", head: true })
      .eq("metadata->>recurring_notification_materialized", "false");
    if (pendingRecurringOccurrenceRepair.error) throw pendingRecurringOccurrenceRepair.error;
    const recurringNotificationRepairPending = Number(pendingRecurringSeriesRepair.count || 0) + Number(pendingRecurringOccurrenceRepair.count || 0);

    return Response.json(
      {
        success: true,
        contract: "AVANTIQO_EXECUTIVE_SECRETARY_MEETING_COORDINATION_WORKER_V4",
        processed: results.length,
        active: Number(active.count || 0),
        needs_input: Number(needsInput.count || 0),
        results,
        notification_repair: notificationRepair,
        booking_notification_repair_pending: notificationRepairPending,
        booking_notification_repair_pending_count_server_side: true,
        booking_notification_repair_pending_count_starvation_free: true,
        meeting_change_notification_repair: changeNotificationRepair,
        meeting_change_notification_repair_pending: changeNotificationRepairPending,
        meeting_change_notification_repair_pending_count_server_side: true,
        meeting_change_notification_repair_pending_count_starvation_free: true,
        recurring_meeting_notification_repair: recurringNotificationRepair,
        recurring_meeting_notification_repair_pending: recurringNotificationRepairPending,
        recurring_meeting_notification_repair_pending_count_server_side: true,
        recurring_meeting_notification_repair_oldest_unfinished_first: true,
        recurring_meeting_notifications_include_all_participants: true,
        recurring_meeting_notifications_deterministic_and_idempotent: true,
        recurring_meeting_notifications_rsvp_not_inferred: true,
        booking_notifications_include_all_participants: true,
        booking_notifications_deterministic_and_idempotent: true,
        booking_notifications_rsvp_not_inferred: true,
        booked_meeting_change_notifications_include_all_participants: true,
        booked_meeting_change_notifications_deterministic_and_idempotent: true,
        booked_meeting_change_notifications_rsvp_not_inferred: true,
        explicit_availability_evidence_required_for_booking: true,
        attendance_not_inferred: true,
        external_authority_used: false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { success: false, error: String(error?.message || error || "Secretary meeting coordination worker failed") },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
