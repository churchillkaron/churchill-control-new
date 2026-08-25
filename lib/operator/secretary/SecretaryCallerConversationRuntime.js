import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { AvantiqoStructuredIntelligenceSupervisorRuntime } from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";
import {
  SECRETARY_CALLER_ALLOWED_ACTIONS,
  appendSecretaryCallTurn,
  bookCallerOwnAppointment,
  cancelCallerOwnAppointment,
  checkCallerAvailability,
  leaveCallerMessage,
  listCallerOwnAppointments,
  readCallerPublicContext,
  requestCallerCallback,
  rescheduleCallerOwnAppointment,
} from "./SecretaryCallerRuntime";

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
]);

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function externalPublicContext(publicContext, ownAppointments) {
  const context = object(publicContext);
  return {
    line: object(context.line),
    public_information: object(context.public_information),
    business_hours: object(context.business_hours),
    booking_policy: object(context.booking_policy),
    own_appointments: Array.isArray(ownAppointments?.appointments)
      ? ownAppointments.appointments.slice(0, 10)
      : [],
    contact_identified: ownAppointments?.contact_identified === true,
    restricted: true,
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
      appointment: {
        appointment_reference: text(appointment.appointment_reference, 120) || null,
        status: text(appointment.status, 40) || null,
        starts_at: appointment.starts_at || null,
        ends_at: appointment.ends_at || null,
        timezone: text(appointment.timezone, 120) || null,
        location: text(appointment.location, 1000) || null,
        event_type: "APPOINTMENT",
      },
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
  if (result.message_recorded === true) return { status: "completed", message_recorded: true };
  return { status: text(result.status, 80) || "completed" };
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
    "Never disclose calendar event titles, attendees, descriptions, counts, owner IDs, contact IDs, or internal event IDs. Availability is only yes/no for the exact requested time window.",
    "own_appointments contains only this identified caller's public-safe appointments. The opaque appointment_reference may be used only for that caller's own reschedule/cancel operation.",
    "If the caller asks what appointments they have, use LIST_APPOINTMENTS or answer only from own_appointments. If more than one appointment could match a change request, use CLARIFY rather than guessing.",
    "A caller may book, reschedule, or cancel only their own appointment. RESCHEDULE_APPOINTMENT and CANCEL_APPOINTMENT require an exact appointment_reference from own_appointments.",
    "If the caller asks to speak with someone later, use REQUEST_CALLBACK. If they want to leave information without a callback commitment, use LEAVE_MESSAGE.",
    "Use ANSWER only for information explicitly present in public_context. If the answer is not there, say you do not have that information and offer a message or callback.",
    "Use CLARIFY when an executable action is missing required details such as exact time, appointment reference, message, or callback reason.",
    "Preserve the caller's language. Do not switch languages unless requested.",
    "Return exactly one JSON object with keys: action, response_language, response_text, starts_at, ends_at, appointment_reference, appointment_title, appointment_description, location, callback_reason, callback_due_at, message_text.",
    "For fields that are not needed, return null. response_text is used for ANSWER or CLARIFY; for executed actions the final spoken response is generated only after server execution evidence exists.",
  ].join("\n");
}

function responseSystem() {
  return [
    "You are Avantiqo Secretary speaking to an outside caller after a restricted receptionist action completed or failed.",
    "Use only action_result and the caller's last message. Never invent facts or expose internal state.",
    "Preserve response_language and speak naturally in that language.",
    "For appointment lists, mention only public-safe appointment times/status and never read an opaque reference aloud unless needed to disambiguate the caller's request.",
    "For booking/rescheduling/cancellation, state only the returned appointment time/status or cancellation status.",
    "If availability is false, say that time is unavailable without explaining why or disclosing calendar contents.",
    "If a callback/message was recorded, confirm only that it was recorded.",
    "If action_result indicates failure, apologize briefly and state the safe outcome; do not expose stack traces or internal error names.",
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
    max_output_tokens: 560,
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
    case "LIST_APPOINTMENTS":
      return listCallerOwnAppointments({ callId });
    case "BOOK_APPOINTMENT":
      return bookCallerOwnAppointment({
        callId,
        startsAt: decision.starts_at,
        endsAt: decision.ends_at,
        title: decision.appointment_title || "Appointment",
        description: decision.appointment_description,
        location: decision.location,
      });
    case "RESCHEDULE_APPOINTMENT":
      return rescheduleCallerOwnAppointment({
        callId,
        appointmentReference: decision.appointment_reference,
        startsAt: decision.starts_at,
        endsAt: decision.ends_at,
      });
    case "CANCEL_APPOINTMENT":
      return cancelCallerOwnAppointment({
        callId,
        appointmentReference: decision.appointment_reference,
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
    max_output_tokens: 280,
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

  const [rawPublicContext, ownAppointments, conversation] = await Promise.all([
    readCallerPublicContext({ callId }),
    listCallerOwnAppointments({ callId }),
    recentTurns(call.organization_id, call.id),
  ]);
  const publicContext = externalPublicContext(rawPublicContext, ownAppointments);

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
    actionResult: externalActionResult(actionError || actionResult),
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
