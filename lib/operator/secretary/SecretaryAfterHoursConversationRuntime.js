import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { AvantiqoStructuredIntelligenceSupervisorRuntime } from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";
import { getConversationTimeline } from "@/lib/commercial/communications/CommunicationService";
import { deliverCommunicationMessage } from "@/lib/commercial/communications/CommunicationDeliveryRuntime";
import { runSecretaryMessageReceptionRequest } from "./SecretaryMessageConversationRuntime";
import { runSecretaryCallerTurn } from "./SecretaryCallerConversationRuntime";
import {
  appendSecretaryCallTurn,
  leaveCallerMessage,
  readCallerPublicContext,
} from "./SecretaryCallerRuntime";
import {
  resolveSecretaryBusinessHoursState,
  secretaryAfterHoursAllowedDecisionActions,
} from "./SecretaryBusinessHoursRuntime";

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

function safeAfterHoursContext(state, publicInformation, businessHours) {
  return {
    business_state: {
      is_open: state.is_open,
      is_after_hours: state.is_after_hours,
      after_hours_mode: state.after_hours_mode,
      timezone: state.timezone,
      next_state_change_at: state.next_state_change_at,
    },
    public_information: object(publicInformation),
    business_hours: object(businessHours),
    restricted: true,
  };
}

async function restrictedDecision({
  organizationId,
  partyId,
  message,
  language,
  publicContext,
  allowedActions,
  channel,
  conversation = [],
}) {
  const result = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
    organization_id: organizationId,
    party_id: partyId || null,
    system: [
      `You are Avantiqo Secretary handling an outside ${channel === "CALL" ? "caller" : "message sender"} outside normal business hours.`,
      `The server permits only these actions right now: ${allowedActions.join(", ")}.`,
      "You must choose only one permitted action. Never attempt booking, rescheduling, cancellation, availability checks, appointment listing, internal lookups, or any other action not listed.",
      "ANSWER may use only public_context. If information is unavailable, say so without inventing facts.",
      "REQUEST_CALLBACK means the Secretary records a callback for the next allowed business period; use only when REQUEST_CALLBACK is permitted.",
      "LEAVE_MESSAGE records the sender's message for staff. Preserve the sender's actual meaning.",
      "CLARIFY asks for missing details needed for a permitted callback or message.",
      "NO_REPLY is allowed only for written spam, automated receipts, delivery reports, or content requiring no response.",
      "Preserve the sender's language. Do not expose internal IDs, calendars, staff data, policies, systems, or private business information.",
      "Return exactly one JSON object with keys action,response_language,response_text,callback_reason,callback_due_at,message_text.",
    ].join("\n"),
    messages: [{
      role: "user",
      content: JSON.stringify({
        public_context: publicContext,
        recent_conversation: conversation,
        sender_message: message,
        detected_language: language || null,
      }),
    }],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: {
      module: "SECRETARY",
      operation: `AFTER_HOURS_${channel}_DECISION`,
      query_plan_only: true,
      caller_authority: "RESTRICTED_PUBLIC_SECRETARY",
      business_hours_restricted: true,
      raw_reasoning_persisted: false,
    },
    mode: "fast",
    max_output_tokens: 420,
  });
  const parsed = object(result?.parsed);
  const action = text(parsed.action, 80).toUpperCase();
  if (!allowedActions.includes(action)) {
    return {
      action: "CLARIFY",
      response_language: text(parsed.response_language, 80) || language || null,
      response_text: "We are currently outside normal business hours. I can take a message" + (allowedActions.includes("REQUEST_CALLBACK") ? " or arrange a callback." : "."),
      callback_reason: null,
      callback_due_at: null,
      message_text: null,
      policy_fallback: true,
    };
  }
  return { ...parsed, action };
}

function callbackDueAt(state, requested) {
  const requestedMs = Date.parse(text(requested, 120));
  const reopenMs = Date.parse(text(state.next_state_change_at, 120));
  const floorMs = Number.isFinite(reopenMs) ? reopenMs : Date.now() + 15 * 60 * 1000;
  return new Date(Math.max(Number.isFinite(requestedMs) ? requestedMs : 0, floorMs)).toISOString();
}

async function createSecretaryOwnedCallback({
  organizationId,
  ownerPartyId,
  contactPartyId,
  callId = null,
  conversationId = null,
  reason,
  dueAt,
  source,
  sourceReference,
}) {
  const instruction = text(reason, 2000);
  if (!instruction) throw new Error("SECRETARY_AFTER_HOURS_CALLBACK_REASON_REQUIRED");

  let query = supabaseAdmin
    .from("secretary_follow_ups")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "PENDING")
    .contains("metadata", { after_hours_source_reference: sourceReference })
    .limit(1);
  const existing = await one(query.maybeSingle());
  if (existing) return existing;

  return one(
    supabaseAdmin
      .from("secretary_follow_ups")
      .insert({
        organization_id: organizationId,
        owner_party_id: ownerPartyId || null,
        contact_party_id: contactPartyId || null,
        call_id: callId || null,
        conversation_id: conversationId || null,
        action_type: "CALL",
        reason: instruction,
        status: "PENDING",
        due_at: dueAt,
        metadata: {
          execution_owner: "SECRETARY",
          execution_ready: true,
          execution_instruction: instruction,
          secretary_owned: true,
          after_hours: true,
          after_hours_source: source,
          after_hours_source_reference: sourceReference,
          external_authority_used: false,
        },
      })
      .select("*")
      .single(),
  );
}

async function messageContext(request) {
  const row = await one(
    supabaseAdmin.from("secretary_message_reception_requests").select("*").eq("id", request.id).maybeSingle(),
  );
  if (!row) throw new Error("SECRETARY_MESSAGE_REQUEST_NOT_FOUND");
  const [conversation, inbound, settings] = await Promise.all([
    one(supabaseAdmin.from("communication_conversations").select("*").eq("organization_id", row.organization_id).eq("id", row.conversation_id).maybeSingle()),
    one(supabaseAdmin.from("communication_messages").select("*").eq("organization_id", row.organization_id).eq("id", row.inbound_message_id).maybeSingle()),
    one(supabaseAdmin.from("secretary_settings").select("default_timezone,default_language,business_hours,message_handling_policy,booking_policy,metadata").eq("organization_id", row.organization_id).maybeSingle()),
  ]);
  if (!conversation || !inbound || inbound.direction !== "INBOUND") throw new Error("SECRETARY_AFTER_HOURS_MESSAGE_CONTEXT_INVALID");
  return { request: row, conversation, inbound, settings };
}

async function resolveMessageContact(context) {
  if (context.request.contact_party_id) return context.request.contact_party_id;
  const provider = text(context.conversation.provider, 120).toLowerCase();
  const channelType = text(context.conversation.channel_type || context.conversation.provider, 120).toLowerCase();
  const participantId = text(context.conversation.external_participant_id, 500);
  if (!provider || !channelType || !participantId) throw new Error("SECRETARY_MESSAGE_CONTACT_IDENTITY_REQUIRED");
  const resolved = await supabaseAdmin.rpc("secretary_resolve_message_contact", {
    p_organization_id: context.request.organization_id,
    p_provider: provider,
    p_channel_type: channelType,
    p_external_participant_id: participantId,
    p_external_address: text(context.conversation.external_participant_address || context.inbound.sender_address, 500) || null,
    p_display_name: text(context.conversation.external_participant_name, 500) || null,
  });
  if (resolved.error) throw resolved.error;
  const partyId = text(resolved.data, 120);
  if (!partyId) throw new Error("SECRETARY_MESSAGE_CONTACT_RESOLUTION_FAILED");
  await Promise.all([
    supabaseAdmin.from("secretary_message_reception_requests").update({ contact_party_id: partyId, updated_at: new Date().toISOString() }).eq("id", context.request.id),
    supabaseAdmin.from("communication_conversations").update({ customer_party_id: partyId, updated_at: new Date().toISOString() }).eq("organization_id", context.request.organization_id).eq("id", context.request.conversation_id).is("customer_party_id", null),
  ]);
  return partyId;
}

async function messageReplyAllowed(organizationId, contactPartyId, policy) {
  const profile = await one(
    supabaseAdmin.from("secretary_contact_profiles").select("allow_messages").eq("organization_id", organizationId).eq("party_id", contactPartyId).maybeSingle(),
  );
  return object(policy).auto_reply_enabled !== false && profile?.allow_messages !== false;
}

async function reserveAndDeliverAfterHoursReply({ context, contactPartyId, body }) {
  const reserved = await supabaseAdmin.rpc("secretary_reserve_message_reply", {
    p_request_id: context.request.id,
    p_body: body,
    p_subject: context.conversation.subject || null,
  });
  if (reserved.error) throw reserved.error;
  const message = reserved.data;
  if (!message?.id) throw new Error("SECRETARY_AFTER_HOURS_REPLY_RESERVATION_REQUIRED");
  const status = text(message.status, 40).toUpperCase();
  if (status !== "QUEUED") return { ...message, delivery_replayed: true };
  return deliverCommunicationMessage({
    organizationId: context.request.organization_id,
    conversationId: context.conversation.id,
    message,
    partyId: contactPartyId,
  });
}

export async function runSecretaryMessageReceptionWithBusinessHours(request) {
  const context = await messageContext(request);
  const policy = object(context.settings?.message_handling_policy);
  const state = resolveSecretaryBusinessHoursState({
    businessHours: object(context.settings?.business_hours),
    handlingPolicy: policy,
    timezone: text(context.settings?.default_timezone, 120) || "UTC",
    channel: "MESSAGE",
    now: new Date(),
  });
  if (!state.is_after_hours || state.after_hours_mode === "FULL_SERVICE") {
    return runSecretaryMessageReceptionRequest(request);
  }

  const contactPartyId = await resolveMessageContact(context);
  const senderMessage = text(context.inbound.body, 12000);
  if (!senderMessage) return runSecretaryMessageReceptionRequest(request);
  const allowedActions = secretaryAfterHoursAllowedDecisionActions(state, { includeNoReply: true });
  const timeline = await getConversationTimeline({ organizationId: context.request.organization_id, conversationId: context.request.conversation_id });
  const recent = (timeline.messages || []).slice(-8).map((item) => ({ direction: item.direction, body: text(item.body, 3000) }));
  const decision = await restrictedDecision({
    organizationId: context.request.organization_id,
    partyId: contactPartyId,
    message: senderMessage,
    language: context.request.detected_language || text(context.settings?.default_language, 80) || null,
    publicContext: safeAfterHoursContext(state, policy.public_information, context.settings?.business_hours),
    allowedActions,
    channel: "MESSAGE",
    conversation: recent,
  });

  let actionResult = null;
  if (decision.action === "REQUEST_CALLBACK") {
    const bookingPolicy = object(context.settings?.booking_policy);
    const metadata = object(context.settings?.metadata);
    const dueAt = callbackDueAt(state, decision.callback_due_at);
    const followUp = await createSecretaryOwnedCallback({
      organizationId: context.request.organization_id,
      ownerPartyId: text(bookingPolicy.owner_party_id || metadata.owner_party_id, 120) || null,
      contactPartyId,
      conversationId: context.request.conversation_id,
      reason: decision.callback_reason || senderMessage,
      dueAt,
      source: "MESSAGE",
      sourceReference: context.request.id,
    });
    actionResult = { status: "completed", callback_request: { status: followUp.status, due_at: followUp.due_at, action_type: "CALL" } };
  } else if (decision.action === "LEAVE_MESSAGE") {
    const bookingPolicy = object(context.settings?.booking_policy);
    const metadata = object(context.settings?.metadata);
    const messageBody = text(decision.message_text, 10000) || senderMessage;
    const existing = await one(supabaseAdmin.from("secretary_tasks").select("*").eq("organization_id", context.request.organization_id).eq("source", "secretary_message").contains("metadata", { after_hours_source_reference: context.request.id }).maybeSingle());
    const task = existing || await one(supabaseAdmin.from("secretary_tasks").insert({
      organization_id: context.request.organization_id,
      owner_party_id: text(bookingPolicy.owner_party_id || metadata.owner_party_id, 120) || null,
      contact_party_id: contactPartyId,
      title: "After-hours message",
      details: messageBody,
      status: "OPEN",
      priority: "NORMAL",
      source: "secretary_message",
      metadata: { after_hours: true, after_hours_source_reference: context.request.id, restricted_message_authority: true },
    }).select("*").single());
    actionResult = { status: "completed", message_recorded: true, task_id: task.id };
  }

  let responseText = text(decision.response_text, 5000);
  if (!responseText && decision.action === "REQUEST_CALLBACK") responseText = "I have recorded your callback request for the next available business period.";
  if (!responseText && decision.action === "LEAVE_MESSAGE") responseText = "I have recorded your message.";
  if (decision.action === "NO_REPLY") responseText = null;
  if (!responseText && decision.action !== "NO_REPLY") responseText = "We are currently outside normal business hours. I can take a message" + (allowedActions.includes("REQUEST_CALLBACK") ? " or arrange a callback." : ".");

  const autoReplyAllowed = await messageReplyAllowed(context.request.organization_id, contactPartyId, policy);
  const responseMessage = responseText && autoReplyAllowed
    ? await reserveAndDeliverAfterHoursReply({ context, contactPartyId, body: responseText })
    : null;

  return {
    status: "completed",
    contract: "AVANTIQO_SECRETARY_MESSAGE_RECEPTION_V1",
    action: decision.action,
    response_language: text(decision.response_language, 80) || context.request.detected_language || null,
    response_text: responseText,
    action_result: actionResult,
    response_message: responseMessage,
    auto_reply_allowed: autoReplyAllowed,
    business_hours_state: state,
    server_allowed_actions: allowedActions,
    caller_authority: "RESTRICTED_PUBLIC_SECRETARY",
    internal_operator_capabilities_available: false,
    external_authority_used: false,
  };
}

async function callContext(callId) {
  return one(supabaseAdmin.from("secretary_calls").select("id,organization_id,contact_party_id,status,remote_address,phone_line_id").eq("id", callId).maybeSingle());
}

export async function runSecretaryCallerTurnWithBusinessHours({ callId, message, language = null } = {}) {
  const call = await callContext(callId);
  if (!call) throw new Error("SECRETARY_CALLER_CALL_NOT_FOUND");
  const [publicContext, settings] = await Promise.all([
    readCallerPublicContext({ callId }),
    one(supabaseAdmin.from("secretary_settings").select("default_timezone,business_hours,call_handling_policy,booking_policy,metadata").eq("organization_id", call.organization_id).maybeSingle()),
  ]);
  const policy = object(settings?.call_handling_policy);
  const state = resolveSecretaryBusinessHoursState({
    businessHours: object(settings?.business_hours),
    handlingPolicy: policy,
    timezone: text(publicContext?.line?.timezone || settings?.default_timezone, 120) || "UTC",
    channel: "CALL",
    now: new Date(),
  });
  if (!state.is_after_hours || state.after_hours_mode === "FULL_SERVICE") {
    return runSecretaryCallerTurn({ callId, message, language });
  }

  const callerMessage = text(message, 12000);
  if (!callerMessage) throw new Error("SECRETARY_CALLER_MESSAGE_REQUIRED");
  await appendSecretaryCallTurn({ callId, speaker: "CALLER", transcript: callerMessage, language, metadata: { caller_authority: "RESTRICTED_PUBLIC_SECRETARY", after_hours: true } });
  const allowedActions = secretaryAfterHoursAllowedDecisionActions(state, { includeNoReply: false });
  const decision = await restrictedDecision({
    organizationId: call.organization_id,
    partyId: call.contact_party_id,
    message: callerMessage,
    language,
    publicContext: safeAfterHoursContext(state, publicContext.public_information, publicContext.business_hours),
    allowedActions,
    channel: "CALL",
  });

  let actionResult = null;
  if (decision.action === "REQUEST_CALLBACK") {
    const bookingPolicy = object(settings?.booking_policy);
    const metadata = object(settings?.metadata);
    const followUp = await createSecretaryOwnedCallback({
      organizationId: call.organization_id,
      ownerPartyId: text(bookingPolicy.owner_party_id || metadata.owner_party_id, 120) || null,
      contactPartyId: call.contact_party_id,
      callId: call.id,
      reason: decision.callback_reason || callerMessage,
      dueAt: callbackDueAt(state, decision.callback_due_at),
      source: "CALL",
      sourceReference: call.id,
    });
    actionResult = { status: "completed", callback_request: { status: followUp.status, due_at: followUp.due_at, action_type: "CALL" } };
  } else if (decision.action === "LEAVE_MESSAGE") {
    actionResult = await leaveCallerMessage({ callId, message: text(decision.message_text, 10000) || callerMessage });
  }

  let responseText = text(decision.response_text, 4000);
  if (!responseText && decision.action === "REQUEST_CALLBACK") responseText = "I have arranged a callback for the next available business period.";
  if (!responseText && decision.action === "LEAVE_MESSAGE") responseText = "I have recorded your message.";
  if (!responseText) responseText = "We are currently outside normal business hours. I can take a message" + (allowedActions.includes("REQUEST_CALLBACK") ? " or arrange a callback." : ".");

  await appendSecretaryCallTurn({
    callId,
    speaker: "SECRETARY",
    transcript: responseText,
    language: text(decision.response_language, 80) || language,
    intent: decision.action,
    decision: { action: decision.action, executed: Boolean(actionResult), business_hours_restricted: true, server_allowed_actions: allowedActions },
    metadata: { after_hours: true, after_hours_mode: state.after_hours_mode, external_authority_used: false, internal_operator_capabilities_available: false },
  });

  return {
    status: "completed",
    contract: "AVANTIQO_SECRETARY_CALLER_TURN_V1",
    action: decision.action,
    response_language: text(decision.response_language, 80) || language || null,
    response_text: responseText,
    action_result: actionResult,
    action_error: null,
    business_hours_state: state,
    server_allowed_actions: allowedActions,
    caller_authority: "RESTRICTED_PUBLIC_SECRETARY",
    internal_operator_capabilities_available: false,
    external_authority_used: false,
  };
}

export default {
  runSecretaryMessageReceptionWithBusinessHours,
  runSecretaryCallerTurnWithBusinessHours,
};
