import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { AvantiqoStructuredIntelligenceSupervisorRuntime } from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";
import {
  getConversationTimeline,
  queueOutboundMessage,
} from "@/lib/commercial/communications/CommunicationService";
import { deliverCommunicationMessage } from "@/lib/commercial/communications/CommunicationDeliveryRuntime";

const MESSAGE_ALLOWED_ACTIONS = Object.freeze([
  "readPublicContext",
  "checkAvailability",
  "bookOwnAppointment",
  "requestCallback",
  "leaveMessage",
]);

const DECISION_ACTIONS = new Set([
  "ANSWER",
  "CHECK_AVAILABILITY",
  "BOOK_APPOINTMENT",
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

async function one(result) {
  if (result.error) throw result.error;
  return result.data || null;
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
      min_notice_minutes: Math.max(0, Number(bookingPolicy.min_notice_minutes || 0)),
      max_days_ahead: Math.max(1, Math.min(730, Number(bookingPolicy.max_days_ahead || 365))),
      require_internal_confirmation: bookingPolicy.require_internal_confirmation === true,
      owner_party_id: text(bookingPolicy.owner_party_id || metadata.owner_party_id, 120) || null,
      appointment_duration_minutes: Math.max(5, Number(bookingPolicy.appointment_duration_minutes || 30)),
    },
  };
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
    p_external_address: text(
      conversation.external_participant_address || inbound.sender_address,
      500,
    ) || null,
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

async function recentConversation(organizationId, conversationId) {
  const timeline = await getConversationTimeline({ organizationId, conversationId });
  return (timeline.messages || []).slice(-12).map((message) => ({
    direction: message.direction,
    body: text(message.body, 4000) || null,
    created_at: message.created_at || null,
  }));
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

async function bookAppointment({ context, contactPartyId, decision }) {
  const policy = context.booking_policy;
  if (!policy.public_booking_enabled) throw new Error("SECRETARY_MESSAGE_PUBLIC_BOOKING_DISABLED");
  if (!policy.owner_party_id) throw new Error("SECRETARY_MESSAGE_BOOKING_OWNER_NOT_CONFIGURED");
  const starts = new Date(decision.starts_at);
  const ends = new Date(decision.ends_at);
  if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || ends <= starts) {
    throw new Error("SECRETARY_MESSAGE_BOOKING_WINDOW_INVALID");
  }
  const now = Date.now();
  if (starts.getTime() < now + policy.min_notice_minutes * 60000) throw new Error("SECRETARY_MESSAGE_BOOKING_MIN_NOTICE");
  if (starts.getTime() > now + policy.max_days_ahead * 86400000) throw new Error("SECRETARY_MESSAGE_BOOKING_TOO_FAR_AHEAD");

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
      self_service_booking: true,
      restricted_message_authority: true,
    },
  });
  if (rpc.error) throw rpc.error;
  return { status: "completed", appointment: rpc.data || null, internal_calendar_details_disclosed: false };
}

async function requestCallback({ organizationId, ownerPartyId, contactPartyId, decision }) {
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
      metadata: { message_sender_requested: true, restricted_message_authority: true },
    })
    .select("id,status,due_at,action_type")
    .single();
  if (result.error) throw result.error;
  return { status: "completed", callback_request: result.data };
}

async function leaveMessage({ organizationId, ownerPartyId, contactPartyId, decision }) {
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
      metadata: { restricted_message_authority: true },
    })
    .select("id,status,title,created_at")
    .single();
  if (result.error) throw result.error;
  return { status: "completed", message_recorded: true, task: result.data };
}

function decisionSystem() {
  return [
    "You are Avantiqo Secretary handling one real inbound written business message from an outside sender.",
    "You are not an internal staff session and you have no access to internal Operator capabilities.",
    `Your only executable actions are: ${MESSAGE_ALLOWED_ACTIONS.join(", ")}.`,
    "Never disclose finance, administration, internal calendars, employee data, customer lists, private business data, internal memory, settings, or any system not explicitly present in public_context.",
    "Availability is only yes/no for the exact requested time window. Never disclose calendar titles, attendees, descriptions, counts, or conflicts.",
    "The sender may book only their own appointment. Use BOOK_APPOINTMENT only when they clearly ask to book the supplied time.",
    "Use ANSWER only for information explicitly present in public_context. If the information is unavailable, offer callback or message handling.",
    "Use NO_REPLY for spam, automated receipts, delivery reports, empty/non-conversational system notifications, or messages that clearly require no business response.",
    "Use CLARIFY when required details are missing.",
    "Preserve the sender's language. Do not switch languages unless requested.",
    "Return exactly one JSON object with keys: action, response_language, response_text, starts_at, ends_at, appointment_title, appointment_description, location, callback_reason, callback_due_at, message_text.",
    "For unused fields return null. Executed actions receive a final response only after server evidence exists.",
  ].join("\n");
}

function finalResponseSystem() {
  return [
    "You are Avantiqo Secretary replying in writing to an outside sender after a restricted action completed or failed.",
    "Use only action_result and sender_message. Never invent facts or expose internal state.",
    "Preserve response_language.",
    "For confirmed/tentative appointments state only returned time/status. For unavailable times never explain why.",
    "For recorded callback/message requests confirm only that the request was recorded.",
    "If action_result contains an error, apologize briefly and offer a safe next step without internal error names.",
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
    max_output_tokens: 500,
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
    max_output_tokens: 240,
  });
  const response = text(result?.parsed?.response_text, 5000);
  if (!response) throw new Error("SECRETARY_MESSAGE_FINAL_RESPONSE_REQUIRED");
  return response;
}

export async function runSecretaryMessageReceptionRequest(request) {
  const contextRows = await messageContext(request);
  const { conversation, inbound } = contextRows;
  const senderMessage = text(inbound.body, 12000);
  if (!senderMessage) {
    return {
      status: "skipped",
      action: "NO_REPLY",
      response_language: null,
      response_text: null,
      action_result: { reason: "NO_TEXT_BODY" },
      response_message: null,
    };
  }

  const contactPartyId = await ensureContactParty(contextRows);
  const [settings, conversationHistory] = await Promise.all([
    publicContext(contextRows.request.organization_id),
    recentConversation(contextRows.request.organization_id, contextRows.request.conversation_id),
  ]);
  const publicInfo = {
    ...settings,
    organization_id: contextRows.request.organization_id,
  };

  const decision = await decide({
    organizationId: contextRows.request.organization_id,
    contactPartyId,
    senderMessage,
    publicInfo,
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
      case "BOOK_APPOINTMENT":
        actionResult = await bookAppointment({ context: publicInfo, contactPartyId, decision });
        break;
      case "REQUEST_CALLBACK":
        actionResult = await requestCallback({
          organizationId: contextRows.request.organization_id,
          ownerPartyId: settings.booking_policy.owner_party_id,
          contactPartyId,
          decision,
        });
        break;
      case "LEAVE_MESSAGE":
        actionResult = await leaveMessage({
          organizationId: contextRows.request.organization_id,
          ownerPartyId: settings.booking_policy.owner_party_id,
          contactPartyId,
          decision,
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
    actionResult: actionError || actionResult,
  });

  let responseMessage = null;
  if (responseText && settings.auto_reply_enabled) {
    const queued = await queueOutboundMessage({
      organizationId: contextRows.request.organization_id,
      conversationId: conversation.id,
      body: responseText,
      sentByPartyId: null,
    });
    responseMessage = await deliverCommunicationMessage({
      organizationId: contextRows.request.organization_id,
      conversationId: conversation.id,
      message: queued,
      partyId: null,
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
    caller_authority: "RESTRICTED_PUBLIC_SECRETARY",
    internal_operator_capabilities_available: false,
    external_authority_used: false,
  };
}

export default runSecretaryMessageReceptionRequest;
