import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { AvantiqoStructuredIntelligenceSupervisorRuntime } from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function organizationId(context = {}) {
  const value = text(context.organizationId, 120);
  if (!value) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return value;
}

function actorPartyId(context = {}) {
  const value = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120);
  if (!value) throw new Error("SECRETARY_REQUESTED_BY_PARTY_REQUIRED");
  return value;
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function many(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return Array.isArray(resolved.data) ? resolved.data : [];
}

function iso(value, field) {
  const raw = text(value, 160);
  if (!raw || !Number.isFinite(Date.parse(raw))) throw new Error(`SECRETARY_MEETING_COORDINATION_${field.toUpperCase()}_INVALID`);
  return new Date(raw).toISOString();
}

function normalizedSlots(value) {
  const slots = list(value).slice(0, 20).map((item, index) => {
    const row = object(item);
    const startsAt = iso(row.starts_at || row.startsAt, "slot_start");
    const endsAt = iso(row.ends_at || row.endsAt, "slot_end");
    if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("SECRETARY_MEETING_COORDINATION_SLOT_WINDOW_INVALID");
    return {
      id: text(row.id, 120) || `slot-${index + 1}`,
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: text(row.timezone, 120) || null,
      label: text(row.label, 300) || null,
    };
  });
  const ids = slots.map((slot) => slot.id);
  if (!slots.length || new Set(ids).size !== ids.length) throw new Error("SECRETARY_MEETING_COORDINATION_SLOTS_REQUIRED");
  return slots;
}

function participantRequestInstruction({ title, purpose, location, timezone, slots, name }) {
  const lines = slots.map((slot) => `${slot.id}: ${slot.starts_at} to ${slot.ends_at}${slot.label ? ` (${slot.label})` : ""}`);
  return [
    `Please ask ${name || "the contact"} for their availability for the meeting \"${title}\".`,
    purpose ? `Purpose: ${purpose}.` : null,
    location ? `Location: ${location}.` : null,
    `Meeting timezone: ${timezone}.`,
    `Candidate slots: ${lines.join("; ")}.`,
    "Ask them to state which slot IDs they can attend, or say none work. Do not imply that any slot is booked or that attendance is confirmed.",
  ].filter(Boolean).join(" ");
}

async function participantRows(coordination) {
  return many(
    supabaseAdmin
      .from("secretary_meeting_coordination_participants")
      .select("*")
      .eq("organization_id", coordination.organization_id)
      .eq("coordination_id", coordination.id)
      .order("created_at", { ascending: true }),
  );
}

async function partyMap(organization, ids) {
  if (!ids.length) return new Map();
  const rows = await many(
    supabaseAdmin
      .from("parties")
      .select("id,display_name,legal_name,status")
      .eq("organization_id", organization)
      .in("id", ids),
  );
  return new Map(rows.map((row) => [row.id, row]));
}

export async function createSecretaryMeetingCoordination({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const requestedBy = actorPartyId(context);
  const ownerPartyId = text(payload.owner_party_id || payload.ownerPartyId, 120) || requestedBy;
  const title = text(payload.title, 500);
  if (!title) throw new Error("SECRETARY_MEETING_COORDINATION_TITLE_REQUIRED");
  const timezone = text(payload.timezone || context.timezone, 120);
  if (!timezone) throw new Error("SECRETARY_MEETING_COORDINATION_TIMEZONE_REQUIRED");
  const slots = normalizedSlots(payload.candidate_slots || payload.candidateSlots);
  const participantsInput = list(payload.participants).slice(0, 50);
  if (!participantsInput.length) throw new Error("SECRETARY_MEETING_COORDINATION_PARTICIPANTS_REQUIRED");
  const participantIds = participantsInput.map((item) => text(object(item).party_id || object(item).partyId, 120)).filter(Boolean);
  if (participantIds.length !== participantsInput.length || new Set(participantIds).size !== participantIds.length) {
    throw new Error("SECRETARY_MEETING_COORDINATION_PARTICIPANTS_INVALID");
  }
  const parties = await partyMap(organization, participantIds);
  if (parties.size !== participantIds.length) throw new Error("SECRETARY_MEETING_COORDINATION_PARTICIPANT_NOT_FOUND");

  const responseDueAt = iso(payload.response_due_at || payload.responseDueAt, "response_due_at");
  if (Date.parse(responseDueAt) <= Date.now()) throw new Error("SECRETARY_MEETING_COORDINATION_RESPONSE_DUE_INVALID");

  const participants = participantsInput.map((item) => {
    const row = object(item);
    const partyId = text(row.party_id || row.partyId, 120);
    const party = parties.get(partyId);
    const actionType = text(row.action_type || row.actionType, 40).toUpperCase() || "MESSAGE";
    if (!["CALL", "MESSAGE", "EMAIL"].includes(actionType)) throw new Error("SECRETARY_MEETING_COORDINATION_CHANNEL_INVALID");
    return {
      party_id: partyId,
      required: row.required !== false,
      action_type: actionType,
      instruction: participantRequestInstruction({
        title,
        purpose: text(payload.purpose, 2000) || null,
        location: text(payload.location, 1000) || null,
        timezone,
        slots,
        name: party?.display_name || party?.legal_name || null,
      }),
    };
  });

  const result = await supabaseAdmin.rpc("secretary_create_meeting_coordination", {
    p_organization_id: organization,
    p_requested_by_party_id: requestedBy,
    p_owner_party_id: ownerPartyId,
    p_title: title,
    p_timezone: timezone,
    p_candidate_slots: slots,
    p_participants: participants,
    p_response_due_at: responseDueAt,
    p_entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
    p_purpose: text(payload.purpose, 2000) || null,
    p_location: text(payload.location, 1000) || null,
    p_reminder_after_minutes: Math.max(30, Math.min(Number(payload.reminder_after_minutes || payload.reminderAfterMinutes) || 1440, 10080)),
    p_max_attempts: Math.max(1, Math.min(Number(payload.max_attempts || payload.maxAttempts) || 100, 500)),
    p_metadata: {
      ...object(payload.metadata),
      meeting_coordination: true,
      attendance_not_inferred: true,
      availability_requires_explicit_evidence: true,
      external_authority_used: false,
    },
  });
  if (result.error) throw result.error;

  return {
    status: "collecting",
    contract: "AVANTIQO_EXECUTIVE_SECRETARY_MEETING_COORDINATION_V1",
    coordination: result.data,
    participant_count: participants.length,
    candidate_slot_count: slots.length,
    secretary_owns_follow_through: true,
    attendance_not_inferred: true,
    availability_requires_explicit_evidence: true,
    calendar_event_created: false,
    external_authority_used: false,
  };
}

async function followUpExecution(participant) {
  return one(
    supabaseAdmin
      .from("secretary_follow_up_executions")
      .select("*")
      .eq("organization_id", participant.organization_id)
      .eq("follow_up_id", participant.follow_up_id)
      .maybeSingle(),
  );
}

async function inboundAfter({ organizationId, conversationId, after }) {
  if (!conversationId || !after) return null;
  const rows = await many(
    supabaseAdmin
      .from("communication_messages")
      .select("id,body,subject,received_at,created_at")
      .eq("organization_id", organizationId)
      .eq("conversation_id", conversationId)
      .eq("direction", "INBOUND")
      .gte("created_at", after)
      .order("created_at", { ascending: true })
      .limit(20),
  );
  return rows[0] || null;
}

function availabilitySystem() {
  return [
    "You are Avantiqo Executive Secretary interpreting one participant's reply to a meeting availability request.",
    "Use only the supplied reply and candidate slots. Never infer attendance, acceptance, timezone, or availability from silence or vague wording.",
    "A slot is AVAILABLE only when the reply explicitly states the participant can attend that slot or clearly accepts its exact time.",
    "A slot is UNAVAILABLE only when explicitly rejected or clearly excluded.",
    "If the reply is ambiguous, contradictory, asks a question, proposes a different time, or does not map cleanly to the supplied slots, set needs_clarification=true.",
    "Do not convert a proposed alternative time into one of the candidate slots unless it exactly matches.",
    "Return exactly one JSON object: {\"available_slot_ids\":[\"...\"],\"unavailable_slot_ids\":[\"...\"],\"none_work\":true|false,\"needs_clarification\":true|false,\"clarification_reason\":\"... or null\",\"confidence\":0.0}.",
  ].join("\n");
}

async function extractAvailability(coordination, participant, responseBody) {
  const result = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
    organization_id: coordination.organization_id,
    party_id: participant.party_id,
    system: availabilitySystem(),
    messages: [{
      role: "user",
      content: JSON.stringify({
        candidate_slots: list(coordination.candidate_slots),
        response_text: text(responseBody, 20000),
      }),
    }],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: {
      module: "SECRETARY",
      operation: "EXTRACT_MEETING_AVAILABILITY",
      secretary_meeting_coordination_id: coordination.id,
      participant_id: participant.id,
      raw_reasoning_persisted: false,
      external_authority_used: false,
    },
    mode: "fast",
    max_output_tokens: 700,
  });
  const parsed = object(result?.parsed);
  const validIds = new Set(list(coordination.candidate_slots).map((slot) => text(slot.id, 120)).filter(Boolean));
  const available = list(parsed.available_slot_ids).map((id) => text(id, 120)).filter((id) => validIds.has(id));
  const unavailable = list(parsed.unavailable_slot_ids).map((id) => text(id, 120)).filter((id) => validIds.has(id));
  const confidenceValue = Number(parsed.confidence);
  return {
    available_slot_ids: [...new Set(available)],
    unavailable_slot_ids: [...new Set(unavailable)],
    none_work: parsed.none_work === true,
    needs_clarification: parsed.needs_clarification === true,
    clarification_reason: text(parsed.clarification_reason, 1000) || null,
    confidence: Number.isFinite(confidenceValue) ? Math.max(0, Math.min(confidenceValue, 1)) : null,
  };
}

async function createClarificationFollowUp(coordination, participant, reason) {
  if (participant.clarification_follow_up_id) return participant.clarification_follow_up_id;
  const slotIds = list(coordination.candidate_slots).map((slot) => text(slot.id, 120)).filter(Boolean);
  const instruction = [
    "Please ask the participant to clarify their availability for the proposed meeting.",
    `Candidate slot IDs are: ${slotIds.join(", ")}.`,
    "Ask them to state exactly which slot IDs work, or say that none work. Do not imply any booking or attendance confirmation.",
    reason ? `Reason clarification is needed: ${reason}.` : null,
  ].filter(Boolean).join(" ");
  const followUp = await one(
    supabaseAdmin
      .from("secretary_follow_ups")
      .insert({
        organization_id: coordination.organization_id,
        entity_id: coordination.entity_id || null,
        owner_party_id: coordination.requested_by_party_id,
        contact_party_id: participant.party_id,
        action_type: participant.action_type,
        reason: instruction,
        status: "PENDING",
        due_at: new Date().toISOString(),
        created_by_party_id: coordination.requested_by_party_id,
        metadata: {
          execution_owner: "SECRETARY",
          execution_ready: true,
          execution_instruction: instruction,
          secretary_meeting_coordination_id: coordination.id,
          meeting_availability_clarification: true,
          external_authority_used: false,
        },
      })
      .select("id")
      .single(),
  );
  await supabaseAdmin
    .from("secretary_meeting_coordination_participants")
    .update({ clarification_follow_up_id: followUp.id, updated_at: new Date().toISOString() })
    .eq("id", participant.id);
  return followUp.id;
}

async function createReminderFollowUp(coordination, participant) {
  if (participant.reminder_count >= 1 || participant.reminder_follow_up_id) return null;
  const instruction = [
    "Politely follow up once on the earlier meeting availability request.",
    `Meeting: ${coordination.title}.`,
    `Candidate slot IDs: ${list(coordination.candidate_slots).map((slot) => text(slot.id, 120)).filter(Boolean).join(", ")}.`,
    "Ask them to state which slot IDs work or that none work. Do not imply any booking or attendance confirmation.",
  ].join(" ");
  const followUp = await one(
    supabaseAdmin
      .from("secretary_follow_ups")
      .insert({
        organization_id: coordination.organization_id,
        entity_id: coordination.entity_id || null,
        owner_party_id: coordination.requested_by_party_id,
        contact_party_id: participant.party_id,
        action_type: participant.action_type,
        reason: instruction,
        status: "PENDING",
        due_at: new Date().toISOString(),
        created_by_party_id: coordination.requested_by_party_id,
        metadata: {
          execution_owner: "SECRETARY",
          execution_ready: true,
          execution_instruction: instruction,
          secretary_meeting_coordination_id: coordination.id,
          meeting_availability_reminder: true,
          external_authority_used: false,
        },
      })
      .select("id")
      .single(),
  );
  await supabaseAdmin
    .from("secretary_meeting_coordination_participants")
    .update({
      reminder_follow_up_id: followUp.id,
      reminder_count: 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", participant.id);
  return followUp.id;
}

async function refreshParticipant(coordination, participant, now) {
  if (["RESPONDED", "UNAVAILABLE", "TIMED_OUT", "FAILED", "CANCELLED"].includes(participant.status)) return participant;
  const execution = await followUpExecution(participant);
  if (!execution) return participant;

  const executionStatus = text(execution.status, 40).toUpperCase();
  const sentAt = execution.completed_at || execution.updated_at || null;
  let patch = {};
  if (["COMPLETED", "QUEUED"].includes(executionStatus)) {
    patch = {
      status: participant.status === "REQUESTED" ? "AWAITING" : participant.status,
      conversation_id: execution.conversation_id || participant.conversation_id || null,
      outbound_message_id: execution.message_id || participant.outbound_message_id || null,
      outbound_call_request_id: execution.outbound_call_request_id || participant.outbound_call_request_id || null,
      request_sent_at: participant.request_sent_at || sentAt,
      updated_at: now.toISOString(),
    };
  } else if (["FAILED", "SKIPPED"].includes(executionStatus)) {
    patch = { status: "FAILED", last_error: execution.last_error || `AVAILABILITY_REQUEST_${executionStatus}`, updated_at: now.toISOString() };
  }

  if (Object.keys(patch).length) {
    participant = await one(
      supabaseAdmin
        .from("secretary_meeting_coordination_participants")
        .update(patch)
        .eq("id", participant.id)
        .select("*")
        .single(),
    );
  }

  if (participant.status !== "AWAITING") return participant;

  if (participant.conversation_id && participant.request_sent_at) {
    const inbound = await inboundAfter({
      organizationId: coordination.organization_id,
      conversationId: participant.conversation_id,
      after: participant.request_sent_at,
    });
    if (inbound) {
      const responseBody = text(inbound.body, 20000) || text(inbound.subject, 4000);
      const availability = await extractAvailability(coordination, participant, responseBody);
      const status = availability.needs_clarification
        ? "AMBIGUOUS"
        : availability.none_work || availability.available_slot_ids.length === 0
          ? "UNAVAILABLE"
          : "RESPONDED";
      participant = await one(
        supabaseAdmin
          .from("secretary_meeting_coordination_participants")
          .update({
            status,
            inbound_message_id: inbound.id,
            received_at: inbound.received_at || inbound.created_at || now.toISOString(),
            response_body: responseBody || null,
            availability,
            extraction_confidence: availability.confidence,
            last_error: availability.needs_clarification ? "MEETING_AVAILABILITY_AMBIGUOUS" : null,
            updated_at: now.toISOString(),
            metadata: {
              ...object(participant.metadata),
              explicit_response_evidence: true,
              attendance_not_inferred: true,
              external_authority_used: false,
            },
          })
          .eq("id", participant.id)
          .select("*")
          .single(),
      );
      if (status === "AMBIGUOUS") await createClarificationFollowUp(coordination, participant, availability.clarification_reason);
      return participant;
    }
  }

  const reminderAt = Date.parse(participant.request_sent_at || participant.created_at) + Number(coordination.reminder_after_minutes || 1440) * 60000;
  if (now.getTime() >= reminderAt && now.getTime() < Date.parse(participant.response_due_at)) {
    await createReminderFollowUp(coordination, participant);
  }
  if (now.getTime() >= Date.parse(participant.response_due_at)) {
    return one(
      supabaseAdmin
        .from("secretary_meeting_coordination_participants")
        .update({ status: "TIMED_OUT", last_error: "MEETING_AVAILABILITY_RESPONSE_WINDOW_EXPIRED", updated_at: now.toISOString() })
        .eq("id", participant.id)
        .select("*")
        .single(),
    );
  }
  return participant;
}

function commonExplicitSlot(coordination, participants) {
  const required = participants.filter((row) => row.required !== false);
  if (!required.length) return null;
  if (required.some((row) => row.status !== "RESPONDED")) return null;
  const slots = list(coordination.candidate_slots);
  return slots.find((slot) => required.every((row) => list(object(row.availability).available_slot_ids).includes(slot.id))) || null;
}

async function ownerSlotStillAvailable(coordination, slot) {
  const result = await supabaseAdmin
    .from("secretary_calendar_events")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", coordination.organization_id)
    .eq("owner_party_id", coordination.owner_party_id)
    .neq("status", "CANCELLED")
    .lt("starts_at", slot.ends_at)
    .gt("ends_at", slot.starts_at);
  if (result.error) throw result.error;
  return Number(result.count || 0) === 0;
}

async function bookSelectedSlot(coordination, slot, participants) {
  const stillAvailable = await ownerSlotStillAvailable(coordination, slot);
  if (!stillAvailable) {
    return one(
      supabaseAdmin
        .from("secretary_meeting_coordinations")
        .update({
          status: "NEEDS_INPUT",
          last_error: "SECRETARY_MEETING_COORDINATION_OWNER_SLOT_NO_LONGER_AVAILABLE",
          selected_slot_id: null,
          lease_token: null,
          lease_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", coordination.id)
        .select("*")
        .single(),
    );
  }
  const rpc = await supabaseAdmin.rpc("secretary_book_calendar_event", {
    p_organization_id: coordination.organization_id,
    p_entity_id: coordination.entity_id || null,
    p_owner_party_id: coordination.owner_party_id,
    p_contact_party_id: null,
    p_title: coordination.title,
    p_description: coordination.purpose || null,
    p_event_type: "MEETING",
    p_status: "CONFIRMED",
    p_starts_at: slot.starts_at,
    p_ends_at: slot.ends_at,
    p_timezone: slot.timezone || coordination.timezone,
    p_all_day: false,
    p_location: coordination.location || null,
    p_source: "secretary_meeting_coordination",
    p_created_by_party_id: coordination.requested_by_party_id,
    p_updated_by_party_id: coordination.requested_by_party_id,
    p_metadata: {
      secretary_meeting_coordination_id: coordination.id,
      selected_slot_id: slot.id,
      participant_party_ids: participants.map((row) => row.party_id),
      required_participant_party_ids: participants.filter((row) => row.required !== false).map((row) => row.party_id),
      attendance_not_inferred: true,
      availability_was_explicitly_collected: true,
      external_authority_used: false,
    },
  });
  if (rpc.error) {
    if (String(rpc.error.message || "").includes("SECRETARY_CALENDAR_SLOT_UNAVAILABLE")) {
      return one(
        supabaseAdmin
          .from("secretary_meeting_coordinations")
          .update({ status: "NEEDS_INPUT", last_error: "SECRETARY_MEETING_COORDINATION_SLOT_RACE_LOST", lease_token: null, lease_expires_at: null, updated_at: new Date().toISOString() })
          .eq("id", coordination.id)
          .select("*")
          .single(),
      );
    }
    throw rpc.error;
  }
  return one(
    supabaseAdmin
      .from("secretary_meeting_coordinations")
      .update({
        status: "BOOKED",
        selected_slot_id: slot.id,
        calendar_event_id: rpc.data?.id || null,
        completed_at: new Date().toISOString(),
        lease_token: null,
        lease_expires_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
        metadata: {
          ...object(coordination.metadata),
          booked_from_explicit_common_availability: true,
          attendance_not_inferred: true,
          external_authority_used: false,
        },
      })
      .eq("id", coordination.id)
      .select("*")
      .single(),
  );
}

export async function processSecretaryMeetingCoordination(coordination) {
  const now = new Date();
  let participants = await participantRows(coordination);
  const refreshed = [];
  for (const participant of participants) refreshed.push(await refreshParticipant(coordination, participant, now));
  participants = refreshed;

  const required = participants.filter((row) => row.required !== false);
  const commonSlot = commonExplicitSlot(coordination, participants);
  if (commonSlot) {
    const booked = await bookSelectedSlot(coordination, commonSlot, participants);
    return { status: text(booked.status, 40).toLowerCase(), coordination: booked, participants, selected_slot: commonSlot, external_authority_used: false };
  }

  const allRequiredTerminal = required.every((row) => ["RESPONDED", "UNAVAILABLE", "TIMED_OUT", "FAILED", "CANCELLED"].includes(row.status));
  if (allRequiredTerminal) {
    const updated = await one(
      supabaseAdmin
        .from("secretary_meeting_coordinations")
        .update({
          status: "NEEDS_INPUT",
          last_error: required.some((row) => ["TIMED_OUT", "FAILED"].includes(row.status))
            ? "SECRETARY_MEETING_COORDINATION_REQUIRED_RESPONSE_MISSING"
            : "SECRETARY_MEETING_COORDINATION_NO_COMMON_EXPLICIT_SLOT",
          lease_token: null,
          lease_expires_at: null,
          updated_at: now.toISOString(),
        })
        .eq("id", coordination.id)
        .select("*")
        .single(),
    );
    return { status: "needs_input", coordination: updated, participants, selected_slot: null, external_authority_used: false };
  }

  const updated = await one(
    supabaseAdmin
      .from("secretary_meeting_coordinations")
      .update({ lease_token: null, lease_expires_at: null, updated_at: now.toISOString() })
      .eq("id", coordination.id)
      .select("*")
      .single(),
  );
  return { status: "collecting", coordination: updated, participants, selected_slot: null, external_authority_used: false };
}

export async function claimSecretaryMeetingCoordination({ workerId, leaseSeconds = 180 } = {}) {
  const worker = text(workerId, 200);
  if (!worker) throw new Error("SECRETARY_MEETING_COORDINATION_WORKER_REQUIRED");
  const result = await supabaseAdmin.rpc("claim_secretary_meeting_coordination", {
    p_worker_id: worker,
    p_lease_seconds: Math.max(30, Math.min(Number(leaseSeconds) || 180, 900)),
  });
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data[0] || null : null;
}

export async function processNextSecretaryMeetingCoordination({ workerId, leaseSeconds = 180 } = {}) {
  const coordination = await claimSecretaryMeetingCoordination({ workerId, leaseSeconds });
  if (!coordination) return { status: "idle", external_authority_used: false };
  try {
    return await processSecretaryMeetingCoordination(coordination);
  } catch (error) {
    const message = text(error?.message || error, 2000);
    const updated = await one(
      supabaseAdmin
        .from("secretary_meeting_coordinations")
        .update({
          status: Number(coordination.attempt_count || 0) >= Number(coordination.max_attempts || 100) ? "FAILED" : coordination.status,
          last_error: message,
          lease_token: null,
          lease_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", coordination.id)
        .select("*")
        .single(),
    );
    return { status: updated.status === "FAILED" ? "failed" : "collecting", coordination: updated, error: message, external_authority_used: false };
  }
}

export async function readSecretaryMeetingCoordination({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const id = text(payload.coordination_id || payload.coordinationId, 120);
  if (!id) throw new Error("SECRETARY_MEETING_COORDINATION_ID_REQUIRED");
  const coordination = await one(
    supabaseAdmin
      .from("secretary_meeting_coordinations")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!coordination) throw new Error("SECRETARY_MEETING_COORDINATION_NOT_FOUND");
  const participants = await participantRows(coordination);
  return {
    status: "completed",
    contract: "AVANTIQO_EXECUTIVE_SECRETARY_MEETING_COORDINATION_STATUS_V1",
    coordination,
    participants,
    attendance_confirmed_party_ids: [],
    attendance_not_inferred: true,
    availability_requires_explicit_evidence: true,
    secretary_owns_follow_through: ["COLLECTING", "READY_TO_BOOK"].includes(coordination.status),
    external_authority_used: false,
  };
}

export async function cancelSecretaryMeetingCoordination({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const id = text(payload.coordination_id || payload.coordinationId, 120);
  if (!id) throw new Error("SECRETARY_MEETING_COORDINATION_ID_REQUIRED");
  const result = await supabaseAdmin.rpc("secretary_cancel_meeting_coordination", {
    p_organization_id: organization,
    p_coordination_id: id,
    p_cancelled_by_party_id: actor,
  });
  if (result.error) throw result.error;
  return { status: "cancelled", coordination: result.data, calendar_event_cancelled: false, external_authority_used: false };
}

export default Object.freeze({
  create: createSecretaryMeetingCoordination,
  read: readSecretaryMeetingCoordination,
  cancel: cancelSecretaryMeetingCoordination,
  processNext: processNextSecretaryMeetingCoordination,
});
