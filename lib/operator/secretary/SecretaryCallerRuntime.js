import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { bookSecretaryCalendarEventAtomic } from "./SecretaryAtomicBookingRuntime";

export const SECRETARY_CALLER_ALLOWED_ACTIONS = Object.freeze([
  "readPublicContext",
  "checkAvailability",
  "bookOwnAppointment",
  "requestCallback",
  "leaveMessage",
]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function iso(value, field, required = false) {
  const clean = text(value, 120);
  if (!clean) {
    if (required) throw new Error(`SECRETARY_CALLER_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(clean);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_CALLER_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

async function one(result) {
  if (result.error) throw result.error;
  return result.data || null;
}

async function callContext(callId) {
  const id = text(callId, 120);
  if (!id) throw new Error("SECRETARY_CALLER_CALL_REQUIRED");
  const call = await one(
    supabaseAdmin
      .from("secretary_calls")
      .select("id,organization_id,phone_line_id,contact_party_id,remote_address,status,started_at,answered_at")
      .eq("id", id)
      .maybeSingle(),
  );
  if (!call) throw new Error("SECRETARY_CALLER_CALL_NOT_FOUND");
  const line = call.phone_line_id
    ? await one(
        supabaseAdmin
          .from("secretary_phone_lines")
          .select("id,organization_id,owner_party_id,line_address,display_name,default_language,timezone,inbound_enabled,outbound_enabled,greeting,metadata,active")
          .eq("organization_id", call.organization_id)
          .eq("id", call.phone_line_id)
          .maybeSingle(),
      )
    : null;
  return { call, line };
}

export async function appendSecretaryCallTurn({ callId, speaker, transcript, language = null, intent = null, decision = {}, metadata = {} } = {}) {
  const { call } = await callContext(callId);
  const normalizedSpeaker = text(speaker, 40).toUpperCase();
  if (!["CALLER", "SECRETARY", "SYSTEM"].includes(normalizedSpeaker)) {
    throw new Error("SECRETARY_CALLER_SPEAKER_INVALID");
  }
  const content = text(transcript, 20000);
  if (!content) throw new Error("SECRETARY_CALLER_TRANSCRIPT_REQUIRED");

  const result = await supabaseAdmin.rpc("secretary_append_call_turn", {
    p_organization_id: call.organization_id,
    p_call_id: call.id,
    p_speaker: normalizedSpeaker,
    p_transcript: content,
    p_language: text(language, 80) || null,
    p_intent: text(intent, 120) || null,
    p_decision: object(decision),
    p_metadata: object(metadata),
    p_started_at: null,
    p_ended_at: null,
  });
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row?.id) throw new Error("SECRETARY_CALL_TURN_RESULT_REQUIRED");
  return row;
}

export async function beginInboundSecretaryCall({ phoneLineId, remoteAddress = null, contactPartyId = null, language = null } = {}) {
  const lineId = text(phoneLineId, 120);
  if (!lineId) throw new Error("SECRETARY_CALLER_PHONE_LINE_REQUIRED");
  const line = await one(
    supabaseAdmin
      .from("secretary_phone_lines")
      .select("*")
      .eq("id", lineId)
      .eq("active", true)
      .eq("inbound_enabled", true)
      .maybeSingle(),
  );
  if (!line) throw new Error("SECRETARY_CALLER_PHONE_LINE_UNAVAILABLE");

  const call = await one(
    supabaseAdmin
      .from("secretary_calls")
      .insert({
        organization_id: line.organization_id,
        phone_line_id: line.id,
        contact_party_id: text(contactPartyId, 120) || null,
        direction: "INBOUND",
        remote_address: text(remoteAddress, 500) || null,
        status: "RINGING",
        started_at: new Date().toISOString(),
        raw_audio_persisted: false,
        metadata: {
          caller_authority: "RESTRICTED_PUBLIC_SECRETARY",
          caller_allowed_actions: SECRETARY_CALLER_ALLOWED_ACTIONS,
          detected_language: text(language, 80) || null,
          external_authority_used: false,
        },
      })
      .select("*")
      .single(),
  );

  return {
    status: "ringing",
    call,
    greeting: text(line.greeting, 2000) || null,
    default_language: text(line.default_language, 80) || null,
    timezone: text(line.timezone, 120) || "UTC",
    authority: "RESTRICTED_PUBLIC_SECRETARY",
    allowed_actions: SECRETARY_CALLER_ALLOWED_ACTIONS,
  };
}

export async function answerSecretaryCall({ callId } = {}) {
  const { call } = await callContext(callId);
  if (!["RINGING", "ANSWERED"].includes(call.status)) throw new Error("SECRETARY_CALLER_CALL_NOT_ANSWERABLE");
  const updated = await one(
    supabaseAdmin
      .from("secretary_calls")
      .update({ status: "ANSWERED", answered_at: call.answered_at || new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("organization_id", call.organization_id)
      .eq("id", call.id)
      .select("*")
      .single(),
  );
  return { status: "answered", call: updated };
}

export async function readCallerPublicContext({ callId } = {}) {
  const { call, line } = await callContext(callId);
  const settings = await one(
    supabaseAdmin
      .from("secretary_settings")
      .select("default_timezone,default_language,business_hours,call_handling_policy,booking_policy")
      .eq("organization_id", call.organization_id)
      .maybeSingle(),
  );
  const callPolicy = object(settings?.call_handling_policy);
  return {
    status: "completed",
    organization_id: call.organization_id,
    line: {
      display_name: text(line?.display_name, 500) || null,
      greeting: text(line?.greeting, 2000) || null,
      timezone: text(line?.timezone || settings?.default_timezone, 120) || "UTC",
      language: text(line?.default_language || settings?.default_language, 80) || null,
    },
    public_information: object(callPolicy.public_information),
    business_hours: object(settings?.business_hours),
    booking_policy: {
      appointment_duration_minutes: Number(object(settings?.booking_policy).appointment_duration_minutes || 0) || null,
      public_booking_enabled: object(settings?.booking_policy).public_booking_enabled !== false,
    },
    restricted: true,
  };
}

export async function checkCallerAvailability({ callId, startsAt, endsAt } = {}) {
  const { call, line } = await callContext(callId);
  const starts = iso(startsAt, "starts_at", true);
  const ends = iso(endsAt, "ends_at", true);
  if (Date.parse(ends) <= Date.parse(starts)) throw new Error("SECRETARY_CALLER_AVAILABILITY_WINDOW_INVALID");
  const ownerPartyId = text(line?.owner_party_id, 120) || null;

  let query = supabaseAdmin
    .from("secretary_calendar_events")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", call.organization_id)
    .neq("status", "CANCELLED")
    .lt("starts_at", ends)
    .gt("ends_at", starts);
  if (ownerPartyId) query = query.eq("owner_party_id", ownerPartyId);
  const result = await query;
  if (result.error) throw result.error;

  return {
    status: "completed",
    starts_at: starts,
    ends_at: ends,
    available: Number(result.count || 0) === 0,
    conflicting_event_count_disclosed: false,
    calendar_event_details_disclosed: false,
  };
}

export async function bookCallerOwnAppointment({ callId, startsAt, endsAt, title = "Appointment", description = null, location = null } = {}) {
  const { call, line } = await callContext(callId);
  if (!call.contact_party_id) throw new Error("SECRETARY_CALLER_CONTACT_REQUIRED_FOR_BOOKING");
  const settings = await one(
    supabaseAdmin
      .from("secretary_settings")
      .select("default_timezone,booking_policy")
      .eq("organization_id", call.organization_id)
      .maybeSingle(),
  );
  const bookingPolicy = object(settings?.booking_policy);
  if (bookingPolicy.public_booking_enabled === false) throw new Error("SECRETARY_CALLER_PUBLIC_BOOKING_DISABLED");

  const starts = iso(startsAt, "starts_at", true);
  const ends = iso(endsAt, "ends_at", true);
  const minNoticeMinutes = Math.max(0, Number(bookingPolicy.min_notice_minutes || 0));
  const maxDaysAhead = Math.max(1, Math.min(730, Number(bookingPolicy.max_days_ahead || 365)));
  const now = Date.now();
  if (Date.parse(starts) < now + minNoticeMinutes * 60 * 1000) throw new Error("SECRETARY_CALLER_BOOKING_MIN_NOTICE");
  if (Date.parse(starts) > now + maxDaysAhead * 24 * 60 * 60 * 1000) throw new Error("SECRETARY_CALLER_BOOKING_TOO_FAR_AHEAD");

  let event;
  try {
    event = await bookSecretaryCalendarEventAtomic({
      organizationId: call.organization_id,
      ownerPartyId: text(line?.owner_party_id, 120) || null,
      contactPartyId: call.contact_party_id,
      title: text(title, 500) || "Appointment",
      description: text(description, 4000) || null,
      eventType: "APPOINTMENT",
      status: bookingPolicy.require_internal_confirmation === true ? "TENTATIVE" : "CONFIRMED",
      startsAt: starts,
      endsAt: ends,
      timezone: text(line?.timezone || settings?.default_timezone, 120) || "UTC",
      location: text(location, 1000) || null,
      source: "secretary_caller",
      metadata: {
        call_id: call.id,
        self_service_booking: true,
        restricted_caller_authority: true,
      },
    });
  } catch (error) {
    if (text(error?.message).includes("SECRETARY_CALENDAR_SLOT_UNAVAILABLE")) {
      throw new Error("SECRETARY_CALLER_SLOT_UNAVAILABLE");
    }
    throw error;
  }

  return {
    status: "completed",
    appointment: {
      id: event.id,
      status: event.status,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      timezone: event.timezone,
      event_type: event.event_type,
    },
    internal_calendar_details_disclosed: false,
  };
}

export async function requestCallerCallback({ callId, reason, dueAt = null } = {}) {
  const { call, line } = await callContext(callId);
  const requestReason = text(reason, 2000);
  if (!requestReason) throw new Error("SECRETARY_CALLER_CALLBACK_REASON_REQUIRED");
  const due = iso(dueAt, "due_at") || new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const followUp = await one(
    supabaseAdmin
      .from("secretary_follow_ups")
      .insert({
        organization_id: call.organization_id,
        owner_party_id: text(line?.owner_party_id, 120) || null,
        contact_party_id: call.contact_party_id || null,
        call_id: call.id,
        action_type: "CALL",
        reason: requestReason,
        status: "PENDING",
        due_at: due,
        metadata: { caller_requested: true, restricted_caller_authority: true },
      })
      .select("id,status,due_at,action_type")
      .single(),
  );
  return { status: "completed", callback_request: followUp };
}

export async function leaveCallerMessage({ callId, message } = {}) {
  const { call, line } = await callContext(callId);
  const content = text(message, 10000);
  if (!content) throw new Error("SECRETARY_CALLER_MESSAGE_REQUIRED");
  const task = await one(
    supabaseAdmin
      .from("secretary_tasks")
      .insert({
        organization_id: call.organization_id,
        owner_party_id: text(line?.owner_party_id, 120) || null,
        contact_party_id: call.contact_party_id || null,
        title: "Caller message",
        details: content,
        status: "OPEN",
        priority: "NORMAL",
        source: "secretary_caller",
        metadata: { call_id: call.id, remote_address: call.remote_address, restricted_caller_authority: true },
      })
      .select("id,status,title,created_at")
      .single(),
  );
  return { status: "completed", message_recorded: true, task };
}

export async function endSecretaryCall({ callId, status = "COMPLETED", summary = null } = {}) {
  const { call } = await callContext(callId);
  const finalStatus = text(status, 40).toUpperCase();
  if (!["COMPLETED", "FAILED", "DECLINED", "VOICEMAIL", "MISSED"].includes(finalStatus)) {
    throw new Error("SECRETARY_CALLER_END_STATUS_INVALID");
  }
  const updated = await one(
    supabaseAdmin
      .from("secretary_calls")
      .update({
        status: finalStatus,
        ended_at: new Date().toISOString(),
        summary: text(summary, 5000) || null,
        raw_audio_persisted: false,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", call.organization_id)
      .eq("id", call.id)
      .select("id,status,started_at,answered_at,ended_at,summary,raw_audio_persisted")
      .single(),
  );
  return { status: "completed", call: updated };
}

export default {
  beginInboundSecretaryCall,
  answerSecretaryCall,
  appendSecretaryCallTurn,
  readCallerPublicContext,
  checkCallerAvailability,
  bookCallerOwnAppointment,
  requestCallerCallback,
  leaveCallerMessage,
  endSecretaryCall,
};
