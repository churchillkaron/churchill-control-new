import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { AvantiqoStructuredIntelligenceSupervisorRuntime } from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";
import { deliverCommunicationMessage } from "@/lib/commercial/communications/CommunicationDeliveryRuntime";
import { evaluateSecretaryContactQuietHours } from "@/lib/operator/secretary/SecretaryContactQuietHoursRuntime";

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
async function one(result) { if (result.error) throw result.error; return result.data || null; }
async function many(result) { if (result.error) throw result.error; return Array.isArray(result.data) ? result.data : []; }

export async function materializeSecretaryAppointmentReminders({ now = new Date() } = {}) {
  const at = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const result = await supabaseAdmin.rpc("secretary_materialize_appointment_reminders", { p_now: at });
  if (result.error) throw result.error;
  return result.data || null;
}

export async function claimSecretaryAppointmentNotification({ workerId, leaseSeconds = 180 } = {}) {
  const worker = text(workerId, 200);
  if (!worker) throw new Error("SECRETARY_APPOINTMENT_NOTIFICATION_WORKER_REQUIRED");
  const result = await supabaseAdmin.rpc("claim_secretary_appointment_notification", { p_worker_id: worker, p_lease_seconds: Math.max(30, Math.min(Number(leaseSeconds) || 180, 900)) });
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data[0] || null : null;
}

async function currentEvent(notification) {
  return one(supabaseAdmin.from("secretary_calendar_events").select("id,organization_id,contact_party_id,self_service_reference,event_type,status,starts_at,ends_at,timezone,location").eq("organization_id", notification.organization_id).eq("id", notification.calendar_event_id).maybeSingle());
}

function stateStillCurrent(notification, event) {
  if (!event || event.event_type !== "APPOINTMENT") return false;
  if (event.contact_party_id !== notification.contact_party_id) return false;
  const kind = text(notification.notification_kind, 40).toUpperCase();
  if (kind === "CANCELLED") return event.status === "CANCELLED";
  if (!["TENTATIVE", "CONFIRMED"].includes(event.status)) return false;
  return String(event.starts_at || "") === String(notification.event_starts_at || "");
}

async function contactPreferences(notification) {
  const [profile, latestLanguage, settings] = await Promise.all([
    one(supabaseAdmin.from("secretary_contact_profiles").select("preferred_language,preferred_channel,timezone,allow_messages,do_not_disturb").eq("organization_id", notification.organization_id).eq("party_id", notification.contact_party_id).maybeSingle()),
    one(supabaseAdmin.from("secretary_message_reception_requests").select("detected_language,completed_at").eq("organization_id", notification.organization_id).eq("contact_party_id", notification.contact_party_id).not("detected_language", "is", null).order("completed_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle()),
    one(supabaseAdmin.from("secretary_settings").select("default_language,default_timezone").eq("organization_id", notification.organization_id).maybeSingle()),
  ]);
  return {
    allow_messages: profile?.allow_messages !== false,
    preferred_channel: text(profile?.preferred_channel, 120).toLowerCase() || null,
    timezone: text(profile?.timezone, 120) || text(settings?.default_timezone, 120) || "UTC",
    do_not_disturb: object(profile?.do_not_disturb),
    language: text(profile?.preferred_language, 80) || text(latestLanguage?.detected_language, 80) || text(settings?.default_language, 80) || "en",
  };
}

async function communicationConversation(notification, preferredChannel) {
  const rows = await many(supabaseAdmin.from("communication_conversations").select("id,organization_id,connection_id,provider,channel_type,external_participant_id,external_participant_address,customer_party_id,subject,status,last_message_at,updated_at").eq("organization_id", notification.organization_id).eq("customer_party_id", notification.contact_party_id).eq("status", "OPEN").order("last_message_at", { ascending: false, nullsFirst: false }).order("updated_at", { ascending: false }).limit(20));
  if (!rows.length) return null;
  if (!preferredChannel) return rows[0];
  return rows.find((row) => text(row.provider, 120).toLowerCase() === preferredChannel || text(row.channel_type, 120).toLowerCase() === preferredChannel) || rows[0];
}

function safeNotificationEvidence(notification, event, language) {
  return {
    notification_kind: text(notification.notification_kind, 40).toUpperCase(),
    reminder_minutes_before: notification.reminder_minutes_before === null ? null : Number(notification.reminder_minutes_before),
    appointment: { status: text(event.status, 40), starts_at: event.starts_at, ends_at: event.ends_at, timezone: text(event.timezone, 120) || "UTC", location: text(event.location, 1000) || null },
    language,
  };
}

async function notificationText(notification, event, language) {
  const result = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
    organization_id: notification.organization_id,
    party_id: null,
    system: [
      "You are Avantiqo Secretary writing a short appointment notification to an outside contact.",
      "Use only the supplied safe notification evidence.",
      "Never mention internal IDs, owners, staff, internal calendars, conflicts, system names, policies, or private business data.",
      "Write in the requested language.",
      "CONFIRMATION: confirm the appointment time and whether it is confirmed or tentative.",
      "RESCHEDULED: state the updated appointment time.",
      "CANCELLED: state that the appointment was cancelled.",
      "REMINDER: politely remind the contact of the upcoming appointment and its time.",
      "Mention location only when supplied. Keep the message concise and natural.",
      "Return exactly one JSON object with key message_text.",
    ].join("\n"),
    messages: [{ role: "user", content: JSON.stringify(safeNotificationEvidence(notification, event, language)) }],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: { module: "SECRETARY", operation: "APPOINTMENT_CONTACT_NOTIFICATION", query_plan_only: true, external_authority_used: false, raw_reasoning_persisted: false },
    mode: "fast",
    max_output_tokens: 220,
  });
  const body = text(result?.parsed?.message_text, 4000);
  if (!body) throw new Error("SECRETARY_APPOINTMENT_NOTIFICATION_TEXT_REQUIRED");
  return body;
}

async function reserveNotificationMessage({ notification, conversation, body }) {
  const result = await supabaseAdmin.rpc("secretary_reserve_appointment_notification_message", { p_notification_id: notification.id, p_conversation_id: conversation.id, p_body: body, p_subject: conversation.subject || null });
  if (result.error) throw result.error;
  if (!result.data?.id) throw new Error("SECRETARY_APPOINTMENT_NOTIFICATION_MESSAGE_REQUIRED");
  return result.data;
}

async function updateNotification(notificationId, patch) {
  const result = await supabaseAdmin.from("secretary_appointment_notifications").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", notificationId).select("*").single();
  if (result.error) throw result.error;
  return result.data;
}

export async function processSecretaryAppointmentNotification(notification) {
  const event = await currentEvent(notification);
  if (!stateStillCurrent(notification, event)) {
    const row = await updateNotification(notification.id, { status: "SUPERSEDED", lease_token: null, lease_expires_at: null, last_error: null, metadata: { ...object(notification.metadata), superseded_at: new Date().toISOString(), superseded_reason: "APPOINTMENT_STATE_CHANGED" } });
    return { status: "superseded", notification: row };
  }

  const preferences = await contactPreferences(notification);
  if (!preferences.allow_messages) {
    const row = await updateNotification(notification.id, { status: "SKIPPED", lease_token: null, lease_expires_at: null, last_error: "SECRETARY_CONTACT_MESSAGES_DISABLED" });
    return { status: "skipped", reason: "CONTACT_MESSAGES_DISABLED", notification: row };
  }

  const quiet = evaluateSecretaryContactQuietHours({ doNotDisturb: preferences.do_not_disturb, timezone: preferences.timezone, channel: "MESSAGE", now: new Date() });
  if (quiet.blocked) {
    const reminderWouldBeLate = text(notification.notification_kind, 40).toUpperCase() === "REMINDER" && quiet.defer_until && Date.parse(quiet.defer_until) >= Date.parse(event.starts_at);
    if (quiet.defer_until && !reminderWouldBeLate) {
      const row = await updateNotification(notification.id, {
        status: "FAILED",
        attempt_count: Math.max(0, Number(notification.attempt_count || 1) - 1),
        available_at: quiet.defer_until,
        lease_token: null,
        lease_expires_at: null,
        last_error: `${quiet.reason}:DEFERRED_UNTIL:${quiet.defer_until}`,
        metadata: { ...object(notification.metadata), quiet_hours_deferred_at: new Date().toISOString(), quiet_hours_deferred_until: quiet.defer_until, quiet_hours_timezone: quiet.timezone },
      });
      return { status: "deferred", reason: quiet.reason, notification: row, defer_until: quiet.defer_until };
    }
    const row = await updateNotification(notification.id, { status: "SKIPPED", lease_token: null, lease_expires_at: null, last_error: reminderWouldBeLate ? "QUIET_HOURS_WOULD_MAKE_REMINDER_LATE" : quiet.reason });
    return { status: "skipped", reason: reminderWouldBeLate ? "QUIET_HOURS_WOULD_MAKE_REMINDER_LATE" : quiet.reason, notification: row };
  }

  const conversation = await communicationConversation(notification, preferences.preferred_channel);
  if (!conversation) {
    const row = await updateNotification(notification.id, { status: "SKIPPED", lease_token: null, lease_expires_at: null, last_error: "SECRETARY_APPOINTMENT_NOTIFICATION_CHANNEL_UNAVAILABLE" });
    return { status: "skipped", reason: "NO_SAFE_COMMUNICATION_CHANNEL", notification: row };
  }

  let message = notification.message_id ? await one(supabaseAdmin.from("communication_messages").select("*").eq("organization_id", notification.organization_id).eq("id", notification.message_id).maybeSingle()) : null;
  if (!message) message = await reserveNotificationMessage({ notification, conversation, body: await notificationText(notification, event, preferences.language) });

  const priorStatus = text(message.status, 40).toUpperCase();
  if (priorStatus === "SENT") {
    const row = await updateNotification(notification.id, { status: "SENT", sent_at: message.sent_at || new Date().toISOString(), conversation_id: conversation.id, message_id: message.id, lease_token: null, lease_expires_at: null, last_error: null });
    return { status: "sent", replayed: true, notification: row, message };
  }
  if (["SENDING", "FAILED"].includes(priorStatus)) {
    const row = await updateNotification(notification.id, { status: "SKIPPED", conversation_id: conversation.id, message_id: message.id, lease_token: null, lease_expires_at: null, last_error: `SECRETARY_APPOINTMENT_NOTIFICATION_REDELIVERY_SUPPRESSED:${priorStatus}` });
    return { status: "skipped", reason: "AMBIGUOUS_OR_FAILED_DELIVERY_RETRY_SUPPRESSED", notification: row, message };
  }

  const delivered = await deliverCommunicationMessage({ organizationId: notification.organization_id, conversationId: conversation.id, message, partyId: null });
  const deliveredStatus = text(delivered?.status, 40).toUpperCase();
  if (deliveredStatus === "SENT") {
    const row = await updateNotification(notification.id, { status: "SENT", sent_at: delivered.sent_at || new Date().toISOString(), conversation_id: conversation.id, message_id: delivered.id || message.id, lease_token: null, lease_expires_at: null, last_error: null });
    return { status: "sent", notification: row, message: delivered };
  }

  const row = await updateNotification(notification.id, { status: "FAILED", available_at: new Date(Date.now() + Math.min(300, 15 * 2 ** Math.min(Number(notification.attempt_count || 1), 5)) * 1000).toISOString(), conversation_id: conversation.id, message_id: delivered?.id || message.id, lease_token: null, lease_expires_at: null, last_error: `SECRETARY_APPOINTMENT_NOTIFICATION_NOT_SENT:${deliveredStatus || "UNKNOWN"}` });
  return { status: "failed", notification: row, message: delivered || message };
}

export default { materializeSecretaryAppointmentReminders, claimSecretaryAppointmentNotification, processSecretaryAppointmentNotification };
