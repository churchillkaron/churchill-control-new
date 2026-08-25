import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { AvantiqoStructuredIntelligenceSupervisorRuntime } from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";
import {
  SECRETARY_CALLER_ALLOWED_ACTIONS,
  appendSecretaryCallTurn,
  bookCallerOwnAppointment,
  checkCallerAvailability,
  leaveCallerMessage,
  readCallerPublicContext,
  requestCallerCallback,
} from "./SecretaryCallerRuntime";

const DECISION_ACTIONS = new Set([
  "ANSWER",
  "CHECK_AVAILABILITY",
  "BOOK_APPOINTMENT",
  "REQUEST_CALLBACK",
  "LEAVE_MESSAGE",
  "CLARIFY",
]);

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function callContext(callId) {
  const id = text(callId, 120);
  if (!id) throw new Error("SECRETARY_CALLER_CALL_REQUIRED");
  const result = await supabaseAdmin
    .from("secretary_calls")
    .select("id,organization_id,contact_party_id,status,remote_address,metadata")
    .eq("id", id)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("SECRETARY_CALLER_CALL_NOT_FOUND");
  return result.data;
}

async function recentTurns(organizationId, callId) {
  const result = await supabaseAdmin
    .from("secretary_call_turns")
    .select("speaker,transcript,language,intent,sequence_number")
    .eq("organization_id", organizationId)
    .eq("call_id", callId)
    .order("sequence_number", { ascending: false })
    .limit(10);
  if (result.error) throw result.error;
  return (result.data || []).reverse();
}

function decisionSystem() {
  return [
    "You are Avantiqo Secretary handling a real inbound business phone conversation.",
    "You are not an internal employee session and you have no access to internal Operator capabilities.",
    `Your only executable actions are: ${SECRETARY_CALLER_ALLOWED_ACTIONS.join(", ")}.`,
    "Never claim access to finance, administration, internal calendars, employee data, customer lists, private business data, internal memory, settings, or any system not explicitly present in public_context.",
    "Never disclose calendar event titles, attendees, descriptions, counts, or conflicts. Availability is only yes/no for the exact requested time window.",
    "A caller may book only their own appointment. BOOK_APPOINTMENT is valid only when the caller clearly asks to book the supplied time and the server later verifies availability and caller identity/contact linkage.",
    "If the caller asks to speak with someone later, use REQUEST_CALLBACK. If they want to leave information without a callback commitment, use LEAVE_MESSAGE.",
    "Use ANSWER only for information explicitly present in public_context. If the answer is not there, say you do not have that information and offer a message or callback.",
    "Use CLARIFY when an executable action is missing required details such as exact time, message, or callback reason.",
    "Preserve the caller's language. Do not switch languages unless requested.",
    "Return exactly one JSON object with keys: action, response_language, response_text, starts_at, ends_at, appointment_title, appointment_description, location, callback_reason, callback_due_at, message_text.",
    "For fields that are not needed, return null. response_text is used for ANSWER or CLARIFY; for executed actions the final spoken response is generated only after server execution evidence exists.",
  ].join("\n");
}

function responseSystem() {
  return [
    "You are Avantiqo Secretary speaking to an outside caller after a restricted receptionist action completed or failed.",
    "Use only action_result and the caller's last message. Never invent facts or expose internal state.",
    "Preserve response_language and speak naturally in that language.",
    "If an appointment is confirmed, state only the time/status returned. If tentative, explain that it is awaiting internal confirmation.",
    "If availability is false, say that time is unavailable without explaining why or disclosing calendar contents.",
    "If a callback/message was recorded, confirm only that it was recorded.",
    "If action_result contains an error, apologize briefly and state the safe outcome; do not expose stack traces or internal names.",
    "Return exactly one JSON object with key response_text.",
  ].join("\n");
}

async function decide({ call, callerMessage, language, publicContext, conversation }) {
  const result = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
    organization_id: call.organization_id,
    party_id: call.contact_party_id || null,
    system: decisionSystem(),
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          public_context: publicContext,
          recent_conversation: conversation,
          caller_message: callerMessage,
          detected_language: language || null,
        }),
      },
    ],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: {
      module: "SECRETARY",
      operation: "CALLER_RESTRICTED_DECISION",
      query_plan_only: true,
      caller_authority: "RESTRICTED_PUBLIC_SECRETARY",
      raw_reasoning_persisted: false,
    },
    mode: "fast",
    max_output_tokens: 500,
  });

  const parsed = object(result?.parsed);
  const action = text(parsed.action, 80).toUpperCase();
  if (!DECISION_ACTIONS.has(action)) throw new Error("SECRETARY_CALLER_DECISION_ACTION_INVALID");
  return { ...parsed, action };
}

async function executeDecision({ callId, decision }) {
  switch (decision.action) {
    case "CHECK_AVAILABILITY":
      return checkCallerAvailability({
        callId,
        startsAt: decision.starts_at,
        endsAt: decision.ends_at,
      });
    case "BOOK_APPOINTMENT":
      return bookCallerOwnAppointment({
        callId,
        startsAt: decision.starts_at,
        endsAt: decision.ends_at,
        title: decision.appointment_title || "Appointment",
        description: decision.appointment_description,
        location: decision.location,
      });
    case "REQUEST_CALLBACK":
      return requestCallerCallback({
        callId,
        reason: decision.callback_reason,
        dueAt: decision.callback_due_at,
      });
    case "LEAVE_MESSAGE":
      return leaveCallerMessage({
        callId,
        message: decision.message_text,
      });
    default:
      return null;
  }
}

async function finalResponse({ call, callerMessage, decision, actionResult }) {
  if (["ANSWER", "CLARIFY"].includes(decision.action)) {
    const direct = text(decision.response_text, 4000);
    if (!direct) throw new Error("SECRETARY_CALLER_RESPONSE_REQUIRED");
    return direct;
  }

  const result = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
    organization_id: call.organization_id,
    party_id: call.contact_party_id || null,
    system: responseSystem(),
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          caller_message: callerMessage,
          response_language: text(decision.response_language, 80) || null,
          action: decision.action,
          action_result: actionResult,
        }),
      },
    ],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: {
      module: "SECRETARY",
      operation: "CALLER_RESTRICTED_RESPONSE",
      query_plan_only: true,
      caller_authority: "RESTRICTED_PUBLIC_SECRETARY",
      raw_reasoning_persisted: false,
    },
    mode: "fast",
    max_output_tokens: 240,
  });
  const response = text(result?.parsed?.response_text, 4000);
  if (!response) throw new Error("SECRETARY_CALLER_FINAL_RESPONSE_REQUIRED");
  return response;
}

export async function runSecretaryCallerTurn({ callId, message, language = null } = {}) {
  const callerMessage = text(message, 12000);
  if (!callerMessage) throw new Error("SECRETARY_CALLER_MESSAGE_REQUIRED");
  const call = await callContext(callId);
  if (!["RINGING", "ANSWERED"].includes(call.status)) throw new Error("SECRETARY_CALLER_CALL_NOT_ACTIVE");

  await appendSecretaryCallTurn({
    callId,
    speaker: "CALLER",
    transcript: callerMessage,
    language,
    metadata: { caller_authority: "RESTRICTED_PUBLIC_SECRETARY" },
  });

  const [publicContext, conversation] = await Promise.all([
    readCallerPublicContext({ callId }),
    recentTurns(call.organization_id, call.id),
  ]);

  const decision = await decide({
    call,
    callerMessage,
    language,
    publicContext,
    conversation,
  });

  let actionResult = null;
  let actionError = null;
  try {
    actionResult = await executeDecision({ callId, decision });
  } catch (error) {
    actionError = {
      success: false,
      error: text(error?.message || error, 500),
    };
  }

  const responseText = await finalResponse({
    call,
    callerMessage,
    decision,
    actionResult: actionError || actionResult,
  });

  await appendSecretaryCallTurn({
    callId,
    speaker: "SECRETARY",
    transcript: responseText,
    language: text(decision.response_language, 80) || language,
    intent: decision.action,
    decision: {
      action: decision.action,
      executed: Boolean(actionResult),
      failed: Boolean(actionError),
      caller_authority: "RESTRICTED_PUBLIC_SECRETARY",
    },
    metadata: {
      external_authority_used: false,
      internal_operator_capabilities_available: false,
    },
  });

  return {
    status: actionError ? "action_failed" : "completed",
    contract: "AVANTIQO_SECRETARY_CALLER_TURN_V1",
    action: decision.action,
    response_language: text(decision.response_language, 80) || language || null,
    response_text: responseText,
    action_result: actionResult,
    action_error: actionError,
    caller_authority: "RESTRICTED_PUBLIC_SECRETARY",
    internal_operator_capabilities_available: false,
    external_authority_used: false,
  };
}

export default runSecretaryCallerTurn;
