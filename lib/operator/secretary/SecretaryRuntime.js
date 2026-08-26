import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function iso(value, field, { required = false } = {}) {
  const clean = text(value, 120);
  if (!clean) {
    if (required) throw new Error(`SECRETARY_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(clean);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

function actorPartyId(context = {}) {
  return text(
    context.actor?.partyId ||
      context.actor?.party_id ||
      context.metadata?.partyId,
    120,
  ) || null;
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

function clampLimit(value, fallback = 50, max = 200) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

export async function readAgenda({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const from = iso(payload.from || payload.date_from || new Date().toISOString(), "agenda_from", { required: true });
  const to = iso(
    payload.to || payload.date_to || new Date(Date.parse(from) + 7 * 24 * 60 * 60 * 1000).toISOString(),
    "agenda_to",
    { required: true },
  );
  if (Date.parse(to) <= Date.parse(from)) throw new Error("SECRETARY_AGENDA_WINDOW_INVALID");

  let query = supabaseAdmin
    .from("secretary_calendar_events")
    .select("id,entity_id,owner_party_id,contact_party_id,title,description,event_type,status,starts_at,ends_at,timezone,all_day,location,recurrence,metadata,created_at,updated_at")
    .eq("organization_id", organization)
    .neq("status", "CANCELLED")
    .lt("starts_at", to)
    .gt("ends_at", from)
    .order("starts_at", { ascending: true })
    .limit(clampLimit(payload.limit));

  if (text(payload.owner_party_id)) query = query.eq("owner_party_id", text(payload.owner_party_id));
  if (text(payload.contact_party_id)) query = query.eq("contact_party_id", text(payload.contact_party_id));

  const events = await many(query);
  return { status: "completed", from, to, count: events.length, events };
}

export async function createCalendarEvent({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const startsAt = iso(payload.starts_at || payload.startsAt, "starts_at", { required: true });
  const endsAt = iso(payload.ends_at || payload.endsAt, "ends_at", { required: true });
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("SECRETARY_CALENDAR_END_BEFORE_START");
  const title = text(payload.title, 500);
  if (!title) throw new Error("SECRETARY_CALENDAR_TITLE_REQUIRED");

  const row = {
    organization_id: organization,
    entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
    owner_party_id: text(payload.owner_party_id || payload.ownerPartyId, 120) || actorPartyId(context),
    contact_party_id: text(payload.contact_party_id || payload.contactPartyId, 120) || null,
    title,
    description: text(payload.description, 4000) || null,
    event_type: text(payload.event_type || payload.eventType, 40).toUpperCase() || "MEETING",
    status: text(payload.status, 40).toUpperCase() || "CONFIRMED",
    starts_at: startsAt,
    ends_at: endsAt,
    timezone: text(payload.timezone, 120) || text(context.timezone, 120) || "UTC",
    all_day: payload.all_day === true || payload.allDay === true,
    location: text(payload.location, 1000) || null,
    recurrence: object(payload.recurrence),
    source: "secretary",
    created_by_party_id: actorPartyId(context),
    updated_by_party_id: actorPartyId(context),
    metadata: object(payload.metadata),
  };

  const data = await one(
    supabaseAdmin
      .from("secretary_calendar_events")
      .insert(row)
      .select("*")
      .single(),
  );
  return { status: "completed", event: data };
}

export async function updateCalendarEvent({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const id = text(payload.event_id || payload.eventId || payload.id, 120);
  if (!id) throw new Error("SECRETARY_CALENDAR_EVENT_REQUIRED");

  const patch = { updated_by_party_id: actorPartyId(context), updated_at: new Date().toISOString() };
  const mappings = [
    ["title", "title"], ["description", "description"], ["location", "location"],
    ["status", "status"], ["event_type", "event_type"], ["timezone", "timezone"],
    ["contact_party_id", "contact_party_id"], ["owner_party_id", "owner_party_id"],
  ];
  for (const [source, target] of mappings) {
    const value = payload[source] ?? payload[source.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];
    if (value !== undefined) patch[target] = ["status", "event_type"].includes(target) ? text(value, 120).toUpperCase() : text(value, 4000) || null;
  }
  if (payload.starts_at !== undefined || payload.startsAt !== undefined) patch.starts_at = iso(payload.starts_at || payload.startsAt, "starts_at", { required: true });
  if (payload.ends_at !== undefined || payload.endsAt !== undefined) patch.ends_at = iso(payload.ends_at || payload.endsAt, "ends_at", { required: true });
  if (payload.all_day !== undefined || payload.allDay !== undefined) patch.all_day = payload.all_day === true || payload.allDay === true;
  if (payload.recurrence !== undefined) patch.recurrence = object(payload.recurrence);
  if (payload.metadata !== undefined) patch.metadata = object(payload.metadata);

  const data = await one(
    supabaseAdmin
      .from("secretary_calendar_events")
      .update(patch)
      .eq("organization_id", organization)
      .eq("id", id)
      .select("*")
      .maybeSingle(),
  );
  if (!data) throw new Error("SECRETARY_CALENDAR_EVENT_NOT_FOUND");
  return { status: "completed", event: data };
}

export async function listContacts({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const queryText = text(payload.query, 300).toLowerCase();
  const profiles = await many(
    supabaseAdmin
      .from("secretary_contact_profiles")
      .select("id,party_id,relationship_label,preferred_language,timezone,preferred_channel,allow_calls,allow_messages,do_not_disturb,important_notes,last_contact_at,next_follow_up_at,metadata,updated_at")
      .eq("organization_id", organization)
      .order("updated_at", { ascending: false })
      .limit(clampLimit(payload.limit, 100, 300)),
  );
  const partyIds = profiles.map((item) => item.party_id).filter(Boolean);
  const parties = partyIds.length
    ? await many(
        supabaseAdmin
          .from("parties")
          .select("id,display_name,email,phone,party_type,status,legal_name,address")
          .eq("organization_id", organization)
          .in("id", partyIds),
      )
    : [];
  const byId = new Map(parties.map((party) => [party.id, party]));
  const contacts = profiles
    .map((profile) => ({ ...profile, party: byId.get(profile.party_id) || null }))
    .filter((contact) => {
      if (!queryText) return true;
      const party = contact.party || {};
      return [party.display_name, party.email, party.phone, contact.relationship_label, contact.important_notes]
        .some((value) => text(value, 1000).toLowerCase().includes(queryText));
    });
  return { status: "completed", count: contacts.length, contacts };
}

export async function upsertContactProfile({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const partyId = text(payload.party_id || payload.partyId, 120);
  if (!partyId) throw new Error("SECRETARY_CONTACT_PARTY_REQUIRED");
  const row = {
    organization_id: organization,
    party_id: partyId,
    relationship_label: text(payload.relationship_label || payload.relationshipLabel, 300) || null,
    preferred_language: text(payload.preferred_language || payload.preferredLanguage, 80) || null,
    timezone: text(payload.timezone, 120) || null,
    preferred_channel: text(payload.preferred_channel || payload.preferredChannel, 80) || null,
    allow_calls: payload.allow_calls !== false && payload.allowCalls !== false,
    allow_messages: payload.allow_messages !== false && payload.allowMessages !== false,
    do_not_disturb: object(payload.do_not_disturb || payload.doNotDisturb),
    important_notes: text(payload.important_notes || payload.importantNotes, 4000) || null,
    next_follow_up_at: iso(payload.next_follow_up_at || payload.nextFollowUpAt, "next_follow_up_at"),
    metadata: object(payload.metadata),
    updated_at: new Date().toISOString(),
  };
  const data = await one(
    supabaseAdmin
      .from("secretary_contact_profiles")
      .upsert(row, { onConflict: "organization_id,party_id" })
      .select("*")
      .single(),
  );
  return { status: "completed", contact: data };
}

export async function listTasks({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  let query = supabaseAdmin
    .from("secretary_tasks")
    .select("*")
    .eq("organization_id", organization)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(clampLimit(payload.limit, 100, 300));
  if (payload.include_completed !== true && payload.includeCompleted !== true) {
    query = query.in("status", ["OPEN", "IN_PROGRESS"]);
  }
  if (text(payload.owner_party_id || payload.ownerPartyId)) query = query.eq("owner_party_id", text(payload.owner_party_id || payload.ownerPartyId));
  const tasks = await many(query);
  return { status: "completed", count: tasks.length, tasks };
}

export async function createTask({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const title = text(payload.title, 500);
  if (!title) throw new Error("SECRETARY_TASK_TITLE_REQUIRED");
  const row = {
    organization_id: organization,
    entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
    owner_party_id: text(payload.owner_party_id || payload.ownerPartyId, 120) || actorPartyId(context),
    contact_party_id: text(payload.contact_party_id || payload.contactPartyId, 120) || null,
    calendar_event_id: text(payload.calendar_event_id || payload.calendarEventId, 120) || null,
    title,
    details: text(payload.details, 4000) || null,
    status: "OPEN",
    priority: text(payload.priority, 40).toUpperCase() || "NORMAL",
    due_at: iso(payload.due_at || payload.dueAt, "due_at"),
    remind_at: iso(payload.remind_at || payload.remindAt, "remind_at"),
    source: "secretary",
    created_by_party_id: actorPartyId(context),
    metadata: object(payload.metadata),
  };
  const data = await one(supabaseAdmin.from("secretary_tasks").insert(row).select("*").single());
  return { status: "completed", task: data };
}

export async function updateTask({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const id = text(payload.task_id || payload.taskId || payload.id, 120);
  if (!id) throw new Error("SECRETARY_TASK_REQUIRED");
  const patch = { updated_at: new Date().toISOString() };
  for (const key of ["title", "details", "priority", "status"]) {
    if (payload[key] !== undefined) patch[key] = ["priority", "status"].includes(key) ? text(payload[key], 80).toUpperCase() : text(payload[key], 4000) || null;
  }
  if (payload.due_at !== undefined || payload.dueAt !== undefined) patch.due_at = iso(payload.due_at || payload.dueAt, "due_at");
  if (payload.remind_at !== undefined || payload.remindAt !== undefined) patch.remind_at = iso(payload.remind_at || payload.remindAt, "remind_at");
  if (patch.status === "DONE") patch.completed_at = new Date().toISOString();
  const data = await one(
    supabaseAdmin.from("secretary_tasks").update(patch).eq("organization_id", organization).eq("id", id).select("*").maybeSingle(),
  );
  if (!data) throw new Error("SECRETARY_TASK_NOT_FOUND");
  return { status: "completed", task: data };
}

export async function listFollowUps({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  let query = supabaseAdmin
    .from("secretary_follow_ups")
    .select("*")
    .eq("organization_id", organization)
    .order("due_at", { ascending: true })
    .limit(clampLimit(payload.limit, 100, 300));
  if (payload.include_completed !== true && payload.includeCompleted !== true) query = query.eq("status", "PENDING");
  const followUps = await many(query);
  return { status: "completed", count: followUps.length, follow_ups: followUps };
}

export async function createFollowUp({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const reason = text(payload.reason, 2000);
  if (!reason) throw new Error("SECRETARY_FOLLOW_UP_REASON_REQUIRED");
  const row = {
    organization_id: organization,
    entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
    owner_party_id: text(payload.owner_party_id || payload.ownerPartyId, 120) || actorPartyId(context),
    contact_party_id: text(payload.contact_party_id || payload.contactPartyId, 120) || null,
    task_id: text(payload.task_id || payload.taskId, 120) || null,
    calendar_event_id: text(payload.calendar_event_id || payload.calendarEventId, 120) || null,
    call_id: text(payload.call_id || payload.callId, 120) || null,
    conversation_id: text(payload.conversation_id || payload.conversationId, 120) || null,
    action_type: text(payload.action_type || payload.actionType, 40).toUpperCase() || "REVIEW",
    reason,
    status: "PENDING",
    due_at: iso(payload.due_at || payload.dueAt, "due_at", { required: true }),
    created_by_party_id: actorPartyId(context),
    metadata: object(payload.metadata),
  };
  const data = await one(supabaseAdmin.from("secretary_follow_ups").insert(row).select("*").single());
  return { status: "completed", follow_up: data };
}

export async function listCalls({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const calls = await many(
    supabaseAdmin
      .from("secretary_calls")
      .select("*")
      .eq("organization_id", organization)
      .order("started_at", { ascending: false })
      .limit(clampLimit(payload.limit, 100, 300)),
  );
  return { status: "completed", count: calls.length, calls };
}

export async function logCall({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const row = {
    organization_id: organization,
    entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
    contact_party_id: text(payload.contact_party_id || payload.contactPartyId, 120) || null,
    conversation_id: text(payload.conversation_id || payload.conversationId, 120) || null,
    direction: text(payload.direction, 40).toUpperCase() || "INBOUND",
    remote_address: text(payload.remote_address || payload.remoteAddress, 500) || null,
    status: text(payload.status, 40).toUpperCase() || "COMPLETED",
    started_at: iso(payload.started_at || payload.startedAt || new Date().toISOString(), "started_at", { required: true }),
    answered_at: iso(payload.answered_at || payload.answeredAt, "answered_at"),
    ended_at: iso(payload.ended_at || payload.endedAt, "ended_at"),
    transcript: text(payload.transcript, 20000) || null,
    summary: text(payload.summary, 5000) || null,
    recording_storage_path: text(payload.recording_storage_path || payload.recordingStoragePath, 1000) || null,
    raw_audio_persisted: payload.raw_audio_persisted === true || payload.rawAudioPersisted === true,
    metadata: object(payload.metadata),
  };
  const data = await one(supabaseAdmin.from("secretary_calls").insert(row).select("*").single());
  return { status: "completed", call: data };
}

export async function readSettings({ context } = {}) {
  const organization = organizationId(context);
  const data = await one(
    supabaseAdmin.from("secretary_settings").select("*").eq("organization_id", organization).maybeSingle(),
  );
  return { status: "completed", settings: data || { organization_id: organization, default_timezone: text(context.timezone, 120) || "UTC" } };
}

export async function updateSettings({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const row = {
    organization_id: organization,
    default_timezone: text(payload.default_timezone || payload.defaultTimezone, 120) || text(context.timezone, 120) || "UTC",
    default_language: text(payload.default_language || payload.defaultLanguage, 80) || null,
    appointment_duration_minutes: Math.max(5, Math.min(1440, Number(payload.appointment_duration_minutes || payload.appointmentDurationMinutes || 30))),
    business_hours: object(payload.business_hours || payload.businessHours),
    call_handling_policy: object(payload.call_handling_policy || payload.callHandlingPolicy),
    message_handling_policy: object(payload.message_handling_policy || payload.messageHandlingPolicy),
    booking_policy: object(payload.booking_policy || payload.bookingPolicy),
    memory_policy: object(payload.memory_policy || payload.memoryPolicy),
    metadata: object(payload.metadata),
    updated_at: new Date().toISOString(),
  };
  const data = await one(
    supabaseAdmin.from("secretary_settings").upsert(row, { onConflict: "organization_id" }).select("*").single(),
  );
  return { status: "completed", settings: data };
}

export const SecretaryRuntime = {
  readAgenda,
  createCalendarEvent,
  updateCalendarEvent,
  listContacts,
  upsertContactProfile,
  listTasks,
  createTask,
  updateTask,
  listFollowUps,
  createFollowUp,
  listCalls,
  logCall,
  readSettings,
  updateSettings,
};

export default SecretaryRuntime;
