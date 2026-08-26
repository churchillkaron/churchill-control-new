import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { AvantiqoStructuredIntelligenceSupervisorRuntime } from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function organizationId(context = {}) {
  const id = text(context.organizationId, 120);
  if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return id;
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

async function resolveCalendarEvent(organization, payload = {}) {
  const eventId = text(payload.calendar_event_id || payload.calendarEventId, 120);
  if (eventId) {
    const event = await one(
      supabaseAdmin
        .from("secretary_calendar_events")
        .select("*")
        .eq("organization_id", organization)
        .eq("id", eventId)
        .maybeSingle(),
    );
    if (!event) throw new Error("SECRETARY_MEETING_PREP_EVENT_NOT_FOUND");
    if (event.status === "CANCELLED") throw new Error("SECRETARY_MEETING_PREP_EVENT_CANCELLED");
    return event;
  }

  const title = text(payload.meeting_title || payload.meetingTitle || payload.title, 500).toLowerCase();
  if (!title) throw new Error("SECRETARY_MEETING_PREP_EVENT_REQUIRED");
  const now = new Date();
  const fromRaw = text(payload.from, 120);
  const toRaw = text(payload.to, 120);
  const from = fromRaw && Number.isFinite(Date.parse(fromRaw)) ? new Date(fromRaw) : now;
  const to = toRaw && Number.isFinite(Date.parse(toRaw))
    ? new Date(toRaw)
    : new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (to <= from) throw new Error("SECRETARY_MEETING_PREP_WINDOW_INVALID");

  const candidates = await many(
    supabaseAdmin
      .from("secretary_calendar_events")
      .select("*")
      .eq("organization_id", organization)
      .neq("status", "CANCELLED")
      .gte("starts_at", from.toISOString())
      .lt("starts_at", to.toISOString())
      .order("starts_at", { ascending: true })
      .limit(100),
  );
  const matches = candidates.filter((row) => text(row.title, 500).toLowerCase() === title);
  if (!matches.length) throw new Error("SECRETARY_MEETING_PREP_EVENT_NOT_FOUND");
  if (matches.length !== 1) throw new Error("SECRETARY_MEETING_PREP_EVENT_AMBIGUOUS");
  return matches[0];
}

async function loadParties(organization, partyIds) {
  const ids = [...new Set(partyIds.map((value) => text(value, 120)).filter(Boolean))].slice(0, 100);
  if (!ids.length) return [];
  const [parties, profiles] = await Promise.all([
    many(
      supabaseAdmin
        .from("parties")
        .select("id,display_name,legal_name,email,phone,party_type,status,address")
        .eq("organization_id", organization)
        .in("id", ids),
    ),
    many(
      supabaseAdmin
        .from("secretary_contact_profiles")
        .select("party_id,relationship_label,preferred_language,timezone,preferred_channel,important_notes,last_contact_at,next_follow_up_at")
        .eq("organization_id", organization)
        .in("party_id", ids),
    ),
  ]);
  const profileByParty = new Map(profiles.map((row) => [row.party_id, row]));
  return parties.map((party) => ({ ...party, secretary_profile: profileByParty.get(party.id) || null }));
}

async function loadOpenCommitments(organization, event, partyIds) {
  const ids = [...new Set(partyIds.filter(Boolean))];
  const [tasks, followUps] = await Promise.all([
    many(
      supabaseAdmin
        .from("secretary_tasks")
        .select("id,title,details,status,priority,due_at,owner_party_id,contact_party_id,calendar_event_id,source,metadata,updated_at")
        .eq("organization_id", organization)
        .in("status", ["OPEN", "IN_PROGRESS"])
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(250),
    ),
    many(
      supabaseAdmin
        .from("secretary_follow_ups")
        .select("id,owner_party_id,contact_party_id,task_id,calendar_event_id,conversation_id,action_type,reason,status,due_at,result,metadata,updated_at")
        .eq("organization_id", organization)
        .eq("status", "PENDING")
        .order("due_at", { ascending: true })
        .limit(250),
    ),
  ]);

  function relevant(row) {
    if (row.calendar_event_id === event.id) return true;
    return ids.includes(row.owner_party_id) || ids.includes(row.contact_party_id);
  }

  return {
    tasks: tasks.filter(relevant).slice(0, 80),
    follow_ups: followUps.filter(relevant).slice(0, 80),
  };
}

async function loadRelevantMeetingHistory(organization, partyIds, limit = 8) {
  const ids = [...new Set(partyIds.filter(Boolean))];
  if (!ids.length) return [];
  const participantRows = await many(
    supabaseAdmin
      .from("secretary_meeting_participants")
      .select("meeting_id,party_id,display_name,participant_role")
      .eq("organization_id", organization)
      .in("party_id", ids)
      .limit(500),
  );
  const meetingIds = [...new Set(participantRows.map((row) => row.meeting_id).filter(Boolean))];
  if (!meetingIds.length) return [];
  const meetings = await many(
    supabaseAdmin
      .from("secretary_meetings")
      .select("id,calendar_event_id,title,status,started_at,ended_at,timezone,executive_summary,protocol,decisions,unresolved_questions,attendee_summary,metadata,processed_at")
      .eq("organization_id", organization)
      .eq("status", "COMPLETED")
      .in("id", meetingIds)
      .order("ended_at", { ascending: false })
      .limit(Math.max(1, Math.min(Number(limit) || 8, 20))),
  );
  const participantsByMeeting = new Map();
  for (const row of participantRows) {
    if (!participantsByMeeting.has(row.meeting_id)) participantsByMeeting.set(row.meeting_id, []);
    participantsByMeeting.get(row.meeting_id).push(row);
  }
  return meetings.map((meeting) => ({
    ...meeting,
    matched_participants: participantsByMeeting.get(meeting.id) || [],
  }));
}

function preparationSystem() {
  return [
    "You are Avantiqo Executive Secretary preparing an executive for an upcoming meeting.",
    "Build a concise world-class meeting preparation pack grounded only in the supplied calendar, participant, task, follow-up and prior-meeting evidence.",
    "Never invent an attendee, relationship, prior decision, deadline, promise, document, message, concern, preference, commercial fact or meeting objective.",
    "A calendar contact or supplied participant is an expected/relevant participant, not proof they will attend.",
    "Distinguish explicit facts from useful questions. Put missing or ambiguous facts in missing_context instead of guessing.",
    "Prior meeting decisions are historical evidence only. Do not treat an old decision as current authority if the current meeting could have changed it.",
    "Open tasks and follow-ups are operational context, not proof that the other party accepts or knows about them.",
    "Highlight decisions the executive may need to make, but never make those decisions for them or imply approval.",
    "Suggested questions and agenda items are advisory preparation only and create no external commitment.",
    "Return exactly one JSON object with keys executive_brief, meeting_objectives, participant_brief, prior_context, open_commitments, decisions_to_prepare, questions_to_ask, risks_and_watchouts, missing_context, suggested_agenda.",
    "Keep the executive_brief readable in under two minutes. Keep each list focused on the highest-value items.",
  ].join("\n");
}

export async function prepareSecretaryMeeting({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const event = await resolveCalendarEvent(organization, payload);
  const suppliedParticipantIds = list(payload.participant_party_ids || payload.participantPartyIds)
    .map((value) => text(value, 120))
    .filter(Boolean);
  const partyIds = [event.owner_party_id, event.contact_party_id, ...suppliedParticipantIds].filter(Boolean);
  const [participants, commitments, history] = await Promise.all([
    loadParties(organization, partyIds),
    loadOpenCommitments(organization, event, partyIds),
    loadRelevantMeetingHistory(organization, partyIds, payload.history_limit || payload.historyLimit || 8),
  ]);

  const result = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
    organization_id: organization,
    party_id: text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null,
    system: preparationSystem(),
    messages: [{
      role: "user",
      content: JSON.stringify({
        time_context: {
          now: new Date().toISOString(),
          executive_timezone: text(context.timezone, 120) || null,
        },
        calendar_event: {
          id: event.id,
          title: event.title,
          description: event.description,
          event_type: event.event_type,
          status: event.status,
          starts_at: event.starts_at,
          ends_at: event.ends_at,
          timezone: event.timezone,
          location: event.location,
          owner_party_id: event.owner_party_id,
          contact_party_id: event.contact_party_id,
          metadata: object(event.metadata),
        },
        participants,
        open_tasks: commitments.tasks,
        pending_follow_ups: commitments.follow_ups,
        prior_meetings: history,
        user_focus: text(payload.focus, 4000) || null,
        user_notes: text(payload.notes, 6000) || null,
      }),
    }],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: {
      module: "SECRETARY",
      operation: "PREPARE_EXECUTIVE_MEETING",
      calendar_event_id: event.id,
      raw_reasoning_persisted: false,
      external_authority_used: false,
    },
    mode: "fast",
    max_output_tokens: 3500,
  });

  const pack = object(result?.parsed);
  return {
    status: "completed",
    contract: "AVANTIQO_EXECUTIVE_SECRETARY_MEETING_PREPARATION_V1",
    calendar_event: event,
    participant_evidence: participants,
    evidence_counts: {
      participants: participants.length,
      open_tasks: commitments.tasks.length,
      pending_follow_ups: commitments.follow_ups.length,
      prior_meetings: history.length,
    },
    preparation_pack: {
      executive_brief: text(pack.executive_brief, 12000) || null,
      meeting_objectives: list(pack.meeting_objectives).slice(0, 20),
      participant_brief: list(pack.participant_brief).slice(0, 50),
      prior_context: list(pack.prior_context).slice(0, 30),
      open_commitments: list(pack.open_commitments).slice(0, 40),
      decisions_to_prepare: list(pack.decisions_to_prepare).slice(0, 20),
      questions_to_ask: list(pack.questions_to_ask).slice(0, 30),
      risks_and_watchouts: list(pack.risks_and_watchouts).slice(0, 20),
      missing_context: list(pack.missing_context).slice(0, 30),
      suggested_agenda: list(pack.suggested_agenda).slice(0, 20),
    },
    read_only: true,
    messages_sent: false,
    calendar_changed: false,
    commitments_created: false,
    authority_created: false,
    external_authority_used: false,
  };
}

export default Object.freeze({
  prepare: prepareSecretaryMeeting,
});
