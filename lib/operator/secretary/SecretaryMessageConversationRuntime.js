import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { AvantiqoStructuredIntelligenceSupervisorRuntime } from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";
import { getConversationTimeline } from "@/lib/commercial/communications/CommunicationService";
import { deliverCommunicationMessage } from "@/lib/commercial/communications/CommunicationDeliveryRuntime";

const MESSAGE_ALLOWED_ACTIONS = Object.freeze([
  "readPublicContext",
  "checkAvailability",
  "listOwnAppointments",
  "bookOwnAppointment",
  "rescheduleOwnAppointment",
  "cancelOwnAppointment",
  "requestCallback",
  "leaveMessage",
]);

const DECISION_ACTIONS = new Set([
  "ANSWER",
  "CHECK_AVAILABILITY",
  "LIST_APPOINTMENTS",
  "BOOK_APPOINTMENT",
  "RESCHEDULE_APPOINTMENT",
  "CANCEL_APPOINTMENT",
  "REQUEST_CALLBACK",
  "LEAVE_MESSAGE",
  "CLARIFY",
  "NO_REPLY",
]);

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function publicAppointment(event = {}) {
  return {
    appointment_reference: text(event.self_service_reference, 120) || null,
    status: text(event.status, 40) || null,
    starts_at: event.starts_at || null,
    ends_at: event.ends_at || null,
    timezone: text(event.timezone, 120) || null,
    location: text(event.location, 1000) || null,
    event_type: "APPOINTMENT",
  };
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function messageContext(request) {
  const row = await one(
    supabaseAdmin
      .from("secretary_message_reception_requests")
      .select("*")
      .eq("id", request.id)
      .maybeSingle(),
  );
  if (!row) throw new Error("SECRETARY_MESSAGE_REQUEST_NOT_FOUND");

  const conversation = await one(
    supabaseAdmin
      .from("communication_conversations")
      .select("*")
      .eq("organization_id", row.organization_id)
      .eq("id", row.conversation_id)
      .maybeSingle(),
  );
  if (!conversation) throw new Error("SECRETARY_MESSAGE_CONVERSATION_NOT_FOUND");

  const inbound = await one(
    supabaseAdmin
      .from("communication_messages")
      .select("*")
      .eq("organization_id", row.organization_id)
      .eq("id", row.inbound_message_id)
      .maybeSingle(),
  );
  if (!inbound || inbound.direction !== "INBOUND") {
    throw new Error("SECRETARY_MESSAGE_INBOUND_REQUIRED");
  }

  return { request: row, conversation, inbound };
}

async function publicContext(organizationId) {
  const settings = await one(
    supabaseAdmin
      .from("secretary_settings")
      .select("default_timezone,default_language,business_hours,message_handling_policy,booking_policy,metadata")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  );
  const messagePolicy = object(settings?.message_handling_policy);
  const bookingPolicy = object(settings?.booking_policy);
  const metadata = object(settings?.metadata);
  return {
    timezone: text(settings?.default_timezone, 120) || "UTC",
    language: text(settings?.default_language, 80) || null,
    public_information: object(messagePolicy.public_information),
    business_hours: object(settings?.business_hours),
    auto_reply_enabled: messagePolicy.auto_reply_enabled !== false,
    booking_policy: {
      public_booking_enabled: bookingPolicy.public_booking_enabled !== false,
      public_reschedule_enabled: bookingPolicy.public_reschedule_enabled !== false,
      public_cancellation_enabled: bookingPolicy.public_cancellation_enabled !== false,
      min_notice_minutes: Math.max(0, Number(bookingPolicy.min_notice_minutes || 0)),
      max_days_ahead: Math.max(1, Math.min(730, Number(bookingPolicy.max_days_ahead || 365))),
      require_internal_confirmation: bookingPolicy.require_internal_confirmation === true,
      owner_party_id: text(bookingPolicy.owner_party_id || metadata.owner_party_id, 120) || null,
      appointment_duration_minutes: Math.max(5, Number(bookingPolicy.appointment_duration_minutes || 30)),
    },
  };
}

function externalPublicContext(settings, ownAppointments) {
  return {
    timezone: settings.timezone,
    language: settings.language,
    public_information: settings.public_information,
    business_hours: settings.business_hours,
    booking_policy: {
      public_booking_enabled: settings.booking_policy.public_booking_enabled,
      public_reschedule_enabled: settings.booking_policy.public_reschedule_enabled,
      public_cancellation_enabled: settings.booking_policy.public_cancellation_enabled,
      min_notice_minutes: settings.booking_policy.min_notice_minutes,
      max_days_ahead: settings.booking_policy.max_days_ahead,
      require_internal_confirmation: settings.booking_policy.require_internal_confirmation,
      appointment_duration_minutes: settings.booking_policy.appointment_duration_minutes,
    },
    own_appointments: Array.isArray(ownAppointments?.appointments)
      ? ownAppointments.appointments.slice(0, 10)
      : [],
  };
}

function externalActionResult(value) {
  const result = object(value);
  if (!Object.keys(result).length) return null;
  if (result.success === false || result.error) return { success: false, status: "failed" };
  if (typeof result.available === "boolean") {
    return {
      status: "completed",
      starts_at: result.starts_at || null,
      ends_at: result.ends_at || null,
      available: result.available,
      calendar_event_details_disclosed: false,
    };
  }
  if (Array.isArray(result.appointments)) {
    return {
      status: "completed",
      count: result.appointments.length,
      appointments: result.appointments,
    };
  }
  if (result.appointment) {
    const appointment = object(result.appointment);
    return {
      status: "completed",
      appointment: publicAppointment(appointment),
    };
  }
  if (result.callback_request) {
    const callback = object(result.callback_request);
    return {
      status: "completed",
      callback_request: {
        status: text(callback.status, 40) || "PENDING",
        due_at: callback.due_at || null,
        action_type: text(callback.action_type, 40) || "CALL",
      },
    };
  }
  if (result.message_recorded === true) {
    return { status: "completed", message_recorded: true };
  }
  return { status: text(result.status, 80) || "completed" };
}

async function ensureContactParty({ request, conversation, inbound }) {
  if (request.contact_party_id) return request.contact_party_id;
  const provider = text(conversation.provider, 120).toLowerCase();
  const channelType = text(conversation.channel_type || conversation.provider, 120).toLowerCase();
  const participantId = text(conversation.external_participant_id, 500);
  if (!provider || !channelType || !participantId) {
    throw new Error("SECRETARY_MESSAGE_CONTACT_IDENTITY_REQUIRED");
  }

  const result = await supabaseAdmin.rpc("secretary_resolve_message_contact", {
    p_organization_id: request.organization_id,
    p_provider: provider,
    p_channel_type: channelType,
    p_external_participant_id: participantId,
    p_external_address: text(conversation.external_participant_address || inbound.sender_address, 500) || null,
    p_display_name: text(conversation.external_participant_name, 500) || null,
  });
  if (result.error) throw result.error;
  const partyId = text(result.data, 120);
  if (!partyId) throw new Error("SECRETARY_MESSAGE_CONTACT_RESOLUTION_FAILED");

  const [requestUpdate, conversationUpdate] = await Promise.all([
    supabaseAdmin
      .from("secretary_message_reception_requests")
      .update({ contact_party_id: partyId, updated_at: new Date().toISOString() })
      .eq("id", request.id),
    supabaseAdmin
      .from("communication_conversations")
      .update({ customer_party_id: partyId, updated_at: new Date().toISOString() })
      .eq("organization_id", request.organization_id)
      .eq("id", request.conversation_id)
      .is("customer_party_id", null),
  ]);
  if (requestUpdate.error) throw requestUpdate.error;
  if (conversationUpdate.error) throw conversationUpdate.error;
  return partyId;
}

async function contactAllowsMessages(organizationId, contactPartyId) {
  const profile = await one(
    supabaseAdmin
      .from("secretary_contact_profiles")
      .select("allow_messages")
      .eq("organization_id", organizationId)
      .eq("party_id", contactPartyId)
      .maybeSingle(),
  );
  return profile?.allow_messages !== false;
}

async function recentConversation(organizationId, conversationId) {
  const timeline = await getConversationTimeline({ organizationId, conversationId });
  return (timeline.messages || []).slice(-12).map((message) => ({
    direction: message.direction,
    body: text(message.body, 4000) || null,
    created_at: message.created_at || null,
  }));
}

async function attachmentCount(organizationId, messageId) {
  const result = await supabaseAdmin
    .from("communication_attachments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("message_id", messageId);
  if (result.error) throw result.error;
  return Number(result.count || 0);
}

async function ensureAttachmentReview({ request, contactPartyId, ownerPartyId, count }) {
  const result = await supabaseAdmin.rpc("secretary_ensure_attachment_review_task", {
    p_request_id: request.id,
    p_contact_party_id: contactPartyId,
    p_owner_party_id: ownerPartyId || null,
    p_attachment_count: Math.max(1, Number(count) || 1),
  });
  if (result.error) throw result.error;
  return result.data || null;
}

async function checkAvailability({ organizationId, ownerPartyId, startsAt, endsAt }) {
  const starts = new Date(startsAt);
  const ends = new Date(endsAt);
  if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || ends <= starts) {
    throw new Error("SECRETARY_MESSAGE_AVAILABILITY_WINDOW_INVALID");
  }
  let query = supabaseAdmin
    .from("secretary_calendar_events")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .neq("status", "CANCELLED")
    .lt("starts_at", ends.toISOString())
    .gt("ends_at", starts.toISOString());
  if (ownerPartyId) query = query.eq("owner_party_id", ownerPartyId);
  const result = await query;
  if (result.error) throw result.error;
  return {
    status: "completed",
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    available: Number(result.count || 0) === 0,
    calendar_event_details_disclosed: false,
  };
}

async function listOwnAppointments({ organizationId, contactPartyId, limit = 10 }) {
  const result = await supabaseAdmin
    .from("secretary_calendar_events")
    .select("self_service_reference,status,starts_at,ends_at,timezone,location,event_type")
    .eq("organization_id", organizationId)
    .eq("contact_party_id", contactPartyId)
    .eq("event_type", "APPOINTMENT")
    .in("status", ["TENTATIVE", "CONFIRMED"])
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 10, 20)));
  if (result.error) throw result.error;
  const appointments = (result.data || []).map(publicAppointment);
  return { status: "completed", count: appointments.length, appointments };
}

async function ownAppointmentByReference({ organizationId, contactPartyId, appointmentReference }) {
  const reference = text(appointmentReference, 120);
  if (!reference) throw new Error("SECRETARY_MESSAGE_APPOINTMENT_REFERENCE_REQUIRED");
  return one(
    supabaseAdmin
      .from("secretary_calendar_events")
      .select("self_service_reference,status,starts_at,ends_at,timezone,location,event_type")
      .eq("organization_id", organizationId)
      .eq("contact_party_id", contactPartyId)
      .eq("self_service_reference", reference)
      .eq("event_type", "APPOINTMENT")
      .maybeSingle(),
  );
}

function enforceSelfServiceWindow(policy, starts) {
  const startMs = Date.parse(starts);
  const now = Date.now();
  if (startMs < now + policy.min_notice_minutes * 60000) throw new Error("SECRETARY_MESSAGE_BOOKING_MIN_NOTICE");
  if (startMs > now + policy.max_days_ahead * 86400000) throw new Error("SECRETARY_MESSAGE_BOOKING_TOO_FAR_AHEAD");
}

async function existingBooking(organizationId, requestId) {
  return one(
    supabaseAdmin
      .from("secretary_calendar_events")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("source", "secretary_message")
      .contains("metadata", { secretary_reception_request_id: requestId })
      .maybeSingle(),
  );
}

async function bookAppointment({ context, contactPartyId, decision, requestId }) {
  const prior = await existingBooking(context.organization_id, requestId);
  if (prior) return { status: "completed", appointment: prior, replayed: true, internal_calendar_details_disclosed: false };

  const policy = context.booking_policy;
  if (!policy.public_booking_enabled) throw new Error("SECRETARY_MESSAGE_PUBLIC_BOOKING_DISABLED");
  if (!policy.owner_party_id) throw new Error("SECRETARY_MESSAGE_BOOKING_OWNER_NOT_CONFIGURED");
  const starts = new Date(decision.starts_at);
  const ends = new Date(decision.ends_at);
  if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || ends <= starts) {
    throw new Error("SECRETARY_MESSAGE_BOOKING_WINDOW_INVALID");
  }
  enforceSelfServiceWindow(policy, starts.toISOString());

  const rpc = await supabaseAdmin.rpc("secretary_book_calendar_event", {
    p_organization_id: context.organization_id,
    p_owner_party_id: policy.owner_party_id,
    p_contact_party_id: contactPartyId,
    p_title: text(decision.appointment_title, 500) || "Appointment",
    p_description: text(decision.appointment_description, 4000) || null,
    p_starts_at: starts.toISOString(),
    p_ends_at: ends.toISOString(),
    p_timezone: context.timezone,
    p_location: text(decision.location, 1000) || null,
    p_status: policy.require_internal_confirmation ? "TENTATIVE" : "CONFIRMED",
    p_source: "secretary_message",
    p_created_by_party_id: null,
    p_metadata: {
      secretary_reception_request_id: requestId,
      self_service_booking: true,
      restricted_message_authority: true,
    },
  });
  if (rpc.error) {
    if (rpc.error.code === "23505") {
      const replayed = await existingBooking(context.organization_id, requestId);
      if (replayed) return { status: "completed", appointment: replayed, replayed: true, internal_calendar_details_disclosed: false };
    }
    throw rpc.error;
  }
  return { status: "completed", appointment: rpc.data || null, replayed: false, internal_calendar_details_disclosed: false };
}

async function rescheduleOwnAppointment({ context, contactPartyId, decision }) {
  const reference = text(decision.appointment_reference, 120);
  if (!reference) throw new Error("SECRETARY_MESSAGE_APPOINTMENT_REFERENCE_REQUIRED");
  if (!context.booking_policy.public_reschedule_enabled) throw new Error("SECRETARY_MESSAGE_PUBLIC_RESCHEDULE_DISABLED");
  const starts = new Date(decision.starts_at);
  const ends = new Date(decision.ends_at);
  if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || ends <= starts) {
    throw new Error("SECRETARY_MESSAGE_BOOKING_WINDOW_INVALID");
  }
  enforceSelfServiceWindow(context.booking_policy, starts.toISOString());

  const prior = await ownAppointmentByReference({
    organizationId: context.organization_id,
    contactPartyId,
    appointmentReference: reference,
  });
  if (!prior) throw new Error("SECRETARY_MESSAGE_APPOINTMENT_NOT_FOUND");
  if (
    ["TENTATIVE", "CONFIRMED"].includes(text(prior.status, 40).toUpperCase()) &&
    prior.starts_at === starts.toISOString() &&
    prior.ends_at === ends.toISOString()
  ) {
    return { status: "completed", appointment: prior, replayed: true };
  }
  if (!["TENTATIVE", "CONFIRMED"].includes(text(prior.status, 40).toUpperCase())) {
    throw new Error("SECRETARY_MESSAGE_APPOINTMENT_NOT_ACTIVE");
  }

  const result = await supabaseAdmin.rpc("secretary_reschedule_own_appointment_ref", {
    p_organization_id: context.organization_id,
    p_contact_party_id: contactPartyId,
    p_self_service_reference: reference,
    p_starts_at: starts.toISOString(),
    p_ends_at: ends.toISOString(),
    p_timezone: context.timezone,
  });
  if (result.error) {
    const message = text(result.error.message || result.error, 1200);
    if (message.includes("SECRETARY_SELF_SERVICE_SLOT_UNAVAILABLE") || result.error.code === "23P01") {
      throw new Error("SECRETARY_MESSAGE_SLOT_UNAVAILABLE");
    }
    throw result.error;
  }
  const event = Array.isArray(result.data) ? result.data[0] : result.data;
  return { status: "completed", appointment: event, replayed: false };
}

async function cancelOwnAppointment({ context, contactPartyId, decision }) {
  const reference = text(decision.appointment_reference, 120);
  if (!reference) throw new Error("SECRETARY_MESSAGE_APPOINTMENT_REFERENCE_REQUIRED");
  if (!context.booking_policy.public_cancellation_enabled) throw new Error("SECRETARY_MESSAGE_PUBLIC_CANCELLATION_DISABLED");

  const prior = await ownAppointmentByReference({
    organizationId: context.organization_id,
    contactPartyId,
    appointmentReference: reference,
  });
  if (!prior) throw new Error("SECRETARY_MESSAGE_APPOINTMENT_NOT_FOUND");
  if (text(prior.status, 40).toUpperCase() === "CANCELLED") {
    return { status: "completed", appointment: prior, replayed: true };
  }
  if (!["TENTATIVE", "CONFIRMED"].includes(text(prior.status, 40).toUpperCase())) {
    throw new Error("SECRETARY_MESSAGE_APPOINTMENT_NOT_ACTIVE");
  }

  const result = await supabaseAdmin.rpc("secretary_cancel_own_appointment_ref", {
    p_organization_id: context.organization_id,
    p_contact_party_id: contactPartyId,
    p_self_service_reference: reference,
  });
  if (result.error) throw result.error;
  const event = Array.isArray(result.data) ? result.data[0] : result.data;
  return { status: "completed", appointment: event, replayed: false };
}

async function existingFollowUp(organizationId, requestId) {
  return one(
    supabaseAdmin
      .from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", organizationId)
      .contains("metadata", { secretary_reception_request_id: requestId })
      .maybeSingle(),
  );
}

async function requestCallback({ organizationId, ownerPartyId, contactPartyId, decision, requestId }) {
  const prior = await existingFollowUp(organizationId, requestId);
  if (prior) return { status: "completed", callback_request: prior, replayed: true };

  const reason = text(decision.callback_reason, 2000);
  if (!reason) throw new Error("SECRETARY_MESSAGE_CALLBACK_REASON_REQUIRED");
  const dueAt = text(decision.callback_due_at, 120);
  const parsed = dueAt ? Date.parse(dueAt) : NaN;
  const due = Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(Date.now() + 15 * 60000).toISOString();
  const result = await supabaseAdmin
    .from("secretary_follow_ups")
    .insert({
      organization_id: organizationId,
      owner_party_id: ownerPartyId || null,
      contact_party_id: contactPartyId,
      action_type: "CALL",
      reason,
      status: "PENDING",
      due_at: due,
      metadata: {
        secretary_reception_request_id: requestId,
        message_sender_requested: true,
        restricted_message_authority: true,
      },
    })
    .select("*")
    .single();
  if (result.error) {
    if (result.error.code === "23505") {
      const replayed = await existingFollowUp(organizationId, requestId);
      if (replayed) return { status: "completed", callback_request: replayed, replayed: true };
    }
    throw result.error;
  }
  return { status: "completed", callback_request: result.data, replayed: false };
}

async function existingMessageTask(organizationId, requestId) {
  return one(
    supabaseAdmin
      .from("secretary_tasks")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("source", "secretary_message")
      .contains("metadata", { secretary_reception_request_id: requestId })
      .maybeSingle(),
  );
}

async function leaveMessage({ organizationId, ownerPartyId, contactPartyId, decision, requestId }) {
  const prior = await existingMessageTask(organizationId, requestId);
  if (prior) return { status: "completed", message_recorded: true, task: prior, replayed: true };

  const message = text(decision.message_text, 10000);
  if (!message) throw new Error("SECRETARY_MESSAGE_CONTENT_REQUIRED");
  const result = await supabaseAdmin
    .from("secretary_tasks")
    .insert({
      organization_id: organizationId,
      owner_party_id: ownerPartyId || null,
      contact_party_id: contactPartyId,
      title: "Incoming message",
      details: message,
      status: "OPEN",
      priority: "NORMAL",
      source: "secretary_message",
      metadata: {
        secretary_reception_request_id: requestId,
        restricted_message_authority: true,
      },
    })
    .select("*")
    .single();
  if (result.error) {
    if (result.error.code === "23505") {
      const replayed = await existingMessageTask(organizationId, requestId);
      if (replayed) return { status: "completed", message_recorded: true, task: replayed, replayed: true };
    }
    throw result.error;
  }
  return { status: "completed", message_recorded: true, task: result.data, replayed: false };
}

function decisionSystem() {
  return [
    "You are Avantiqo Secretary handling one real inbound written business message from an outside sender.",
    "You are not an internal staff session and you have no access to internal Operator capabilities.",
    `Your only executable actions are: ${MESSAGE_ALLOWED_ACTIONS.join(", ")}.`,
    "Never disclose finance, administration, internal calendars, employee data, customer lists, private business data, internal memory, settings, owner IDs, contact IDs, or internal event IDs.",
    "Availability is only yes/no for the exact requested time window. Never disclose calendar titles, attendees, descriptions, counts, or conflicts.",
    "own_appointments contains only this sender's public-safe future appointments. The opaque appointment_reference may be used only for that sender's own reschedule/cancel operation.",
    "If the sender asks what appointments they have, use LIST_APPOINTMENTS or answer only from own_appointments. If more than one appointment could match a change request, use CLARIFY rather than guessing.",
    "The sender may book, reschedule, or cancel only their own appointment. RESCHEDULE_APPOINTMENT and CANCEL_APPOINTMENT require an exact appointment_reference from own_appointments.",
    "Use ANSWER only for information explicitly present in public_context. If the information is unavailable, offer callback or message handling.",
    "Use NO_REPLY for spam, automated receipts, delivery reports, empty/non-conversational system notifications, or messages that clearly require no business response.",
    "Use CLARIFY when required details are missing.",
    "Preserve the sender's language. Do not switch languages unless requested.",
    "Return exactly one JSON object with keys: action, response_language, response_text, starts_at, ends_at, appointment_reference, appointment_title, appointment_description, location, callback_reason, callback_due_at, message_text.",
    "For unused fields return null. Executed actions receive a final response only after server evidence exists.",
  ].join("\n");
}

function finalResponseSystem() {
  return [
    "You are Avantiqo Secretary replying in writing to an outside sender after a restricted action completed or failed.",
    "Use only action_result and sender_message. Never invent facts or expose internal state.",
    "Preserve response_language.",
    "For appointment lists, mention only public-safe appointment times/status. Do not expose internal IDs.",
    "For booking/rescheduling/cancellation, state only returned appointment time/status or cancellation status.",
    "For unavailable times never explain why.",
    "For recorded callback/message requests confirm only that the request was recorded.",
    "If action_result indicates failure, apologize briefly and offer a safe next step without internal error names.",
    "Return exactly one JSON object with key response_text.",
  ].join("\n");
}

async function decide({ organizationId, contactPartyId, senderMessage, publicInfo, conversation }) {
  const result = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
    organization_id: organizationId,
    party_id: contactPartyId || null,
    system: decisionSystem(),
    messages: [{
      role: "user",
      content: JSON.stringify({
        public_context: publicInfo,
        recent_conversation: conversation,
        sender_message: senderMessage,
      }),
    }],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: {
      module: "SECRETARY",
      operation: "MESSAGE_RESTRICTED_DECISION",
      query_plan_only: true,
      caller_authority: "RESTRICTED_PUBLIC_SECRETARY",
      raw_reasoning_persisted: false,
    },
    mode: "fast",
    max_output_tokens: 560,
  });
  const parsed = object(result?.parsed);
  const action = text(parsed.action, 80).toUpperCase();
  if (!DECISION_ACTIONS.has(action)) throw new Error("SECRETARY_MESSAGE_DECISION_ACTION_INVALID");
  return { ...parsed, action };
}

async function finalResponse({ organizationId, contactPartyId, senderMessage, decision, actionResult }) {
  if (["ANSWER", "CLARIFY"].includes(decision.action)) {
    const direct = text(decision.response_text, 5000);
    if (!direct) throw new Error("SECRETARY_MESSAGE_RESPONSE_REQUIRED");
    return direct;
  }
  if (decision.action === "NO_REPLY") return null;

  const result = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
    organization_id: organizationId,
    party_id: contactPartyId || null,
    system: finalResponseSystem(),
    messages: [{
      role: "user",
      content: JSON.stringify({
        sender_message: senderMessage,
        response_language: text(decision.response_language, 80) || null,
        action: decision.action,
        action_result: actionResult,
      }),
    }],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: {
      module: "SECRETARY",
      operation: "MESSAGE_RESTRICTED_RESPONSE",
      query_plan_only: true,
      caller_authority: "RESTRICTED_PUBLIC_SECRETARY",
      raw_reasoning_persisted: false,
    },
    mode: "fast",
    max_output_tokens: 280,
  });
  const response = text(result?.parsed?.response_text, 5000);
  if (!response) throw new Error("SECRETARY_MESSAGE_FINAL_RESPONSE_REQUIRED");
  return response;
}

async function reserveAndDeliverReply({ request, conversation, responseText, contactPartyId }) {
  const reserved = await supabaseAdmin.rpc("secretary_reserve_message_reply", {
    p_request_id: request.id,
    p_body: responseText,
    p_subject: conversation.subject || null,
  });
  if (reserved.error) throw reserved.error;
  const message = reserved.data;
  if (!message?.id) throw new Error("SECRETARY_MESSAGE_RESERVED_REPLY_REQUIRED");

  const status = text(message.status, 40).toUpperCase();
  if (status !== "QUEUED") {
    return {
      ...message,
      delivery_replayed: true,
      automatic_redelivery_suppressed: ["SENDING", "FAILED"].includes(status),
    };
  }

  return deliverCommunicationMessage({
    organizationId: request.organization_id,
    conversationId: conversation.id,
    message,
    partyId: contactPartyId,
  });
}

export async function runSecretaryMessageReceptionRequest(request) {
  const contextRows = await messageContext(request);
  const { conversation, inbound } = contextRows;
  const contactPartyId = await ensureContactParty(contextRows);
  const settings = await publicContext(contextRows.request.organization_id);
  const senderMessage = text(inbound.body, 12000);

  if (!senderMessage) {
    const count = await attachmentCount(contextRows.request.organization_id, inbound.id);
    if (count > 0) {
      const task = await ensureAttachmentReview({
        request: contextRows.request,
        contactPartyId,
        ownerPartyId: settings.booking_policy.owner_party_id,
        count,
      });
      return {
        status: "completed",
        contract: "AVANTIQO_SECRETARY_MESSAGE_RECEPTION_V1",
        action: "ATTACHMENT_REVIEW",
        response_language: null,
        response_text: null,
        action_result: { attachment_count: count, review_task: task },
        response_message: null,
        caller_authority: "RESTRICTED_PUBLIC_SECRETARY",
        internal_operator_capabilities_available: false,
        external_authority_used: false,
      };
    }
    return {
      status: "skipped",
      contract: "AVANTIQO_SECRETARY_MESSAGE_RECEPTION_V1",
      action: "NO_REPLY",
      response_language: null,
      response_text: null,
      action_result: { reason: "EMPTY_INBOUND_MESSAGE" },
      response_message: null,
      caller_authority: "RESTRICTED_PUBLIC_SECRETARY",
      internal_operator_capabilities_available: false,
      external_authority_used: false,
    };
  }

  const [conversationHistory, ownAppointments] = await Promise.all([
    recentConversation(
      contextRows.request.organization_id,
      contextRows.request.conversation_id,
    ),
    listOwnAppointments({
      organizationId: contextRows.request.organization_id,
      contactPartyId,
    }),
  ]);
  const modelPublicInfo = externalPublicContext(settings, ownAppointments);
  const executionContext = {
    ...settings,
    organization_id: contextRows.request.organization_id,
  };

  const decision = await decide({
    organizationId: contextRows.request.organization_id,
    contactPartyId,
    senderMessage,
    publicInfo: modelPublicInfo,
    conversation: conversationHistory,
  });

  let actionResult = null;
  let actionError = null;
  try {
    switch (decision.action) {
      case "CHECK_AVAILABILITY":
        actionResult = await checkAvailability({
          organizationId: contextRows.request.organization_id,
          ownerPartyId: settings.booking_policy.owner_party_id,
          startsAt: decision.starts_at,
          endsAt: decision.ends_at,
        });
        break;
      case "LIST_APPOINTMENTS":
        actionResult = ownAppointments;
        break;
      case "BOOK_APPOINTMENT":
        actionResult = await bookAppointment({
          context: executionContext,
          contactPartyId,
          decision,
          requestId: contextRows.request.id,
        });
        break;
      case "RESCHEDULE_APPOINTMENT":
        actionResult = await rescheduleOwnAppointment({
          context: executionContext,
          contactPartyId,
          decision,
        });
        break;
      case "CANCEL_APPOINTMENT":
        actionResult = await cancelOwnAppointment({
          context: executionContext,
          contactPartyId,
          decision,
        });
        break;
      case "REQUEST_CALLBACK":
        actionResult = await requestCallback({
          organizationId: contextRows.request.organization_id,
          ownerPartyId: settings.booking_policy.owner_party_id,
          contactPartyId,
          decision,
          requestId: contextRows.request.id,
        });
        break;
      case "LEAVE_MESSAGE":
        actionResult = await leaveMessage({
          organizationId: contextRows.request.organization_id,
          ownerPartyId: settings.booking_policy.owner_party_id,
          contactPartyId,
          decision,
          requestId: contextRows.request.id,
        });
        break;
      default:
        actionResult = null;
    }
  } catch (error) {
    actionError = { success: false, error: text(error?.message || error, 500) };
  }

  const responseText = await finalResponse({
    organizationId: contextRows.request.organization_id,
    contactPartyId,
    senderMessage,
    decision,
    actionResult: externalActionResult(actionError || actionResult),
  });

  const allowMessages = await contactAllowsMessages(
    contextRows.request.organization_id,
    contactPartyId,
  );
  const autoReplyAllowed = settings.auto_reply_enabled && allowMessages;

  let responseMessage = null;
  if (responseText && autoReplyAllowed) {
    responseMessage = await reserveAndDeliverReply({
      request: contextRows.request,
      conversation,
      responseText,
      contactPartyId,
    });
  }

  return {
    status: actionError ? "action_failed" : "completed",
    contract: "AVANTIQO_SECRETARY_MESSAGE_RECEPTION_V1",
    action: decision.action,
    response_language: text(decision.response_language, 80) || null,
    response_text: responseText,
    action_result: actionError || actionResult,
    response_message: responseMessage,
    auto_reply_allowed: autoReplyAllowed,
    auto_reply_suppressed_reason:
      responseText && !autoReplyAllowed
        ? allowMessages
          ? "SECRETARY_MESSAGE_AUTO_REPLY_DISABLED"
          : "SECRETARY_CONTACT_MESSAGES_DISABLED"
        : null,
    caller_authority: "RESTRICTED_PUBLIC_SECRETARY",
    internal_operator_capabilities_available: false,
    external_authority_used: false,
  };
}

export default runSecretaryMessageReceptionRequest;
