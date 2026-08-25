import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function limit(value, fallback = 50, max = 200) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(1, Math.min(max, Math.floor(number)))
    : fallback;
}

function iso(value, fallback) {
  const candidate = text(value, 120);
  const parsed = Date.parse(candidate || fallback);
  if (!Number.isFinite(parsed)) throw new Error("SECRETARY_DUE_WORK_TIME_INVALID");
  return new Date(parsed).toISOString();
}

async function rows(result) {
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data : [];
}

export async function scanSecretaryDueWork({ context, payload = {} } = {}) {
  const organizationId = text(context?.organizationId, 120);
  if (!organizationId) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");

  const now = iso(payload.now, new Date().toISOString());
  const horizonHours = Math.max(1, Math.min(168, Number(payload.horizon_hours || payload.horizonHours || 24)));
  const horizon = new Date(Date.parse(now) + horizonHours * 60 * 60 * 1000).toISOString();
  const maxRows = limit(payload.limit, 50, 200);

  const [tasks, followUps, events, missedCalls] = await Promise.all([
    rows(
      supabaseAdmin
        .from("secretary_tasks")
        .select("id,owner_party_id,contact_party_id,title,details,status,priority,due_at,remind_at,calendar_event_id,metadata")
        .eq("organization_id", organizationId)
        .in("status", ["OPEN", "IN_PROGRESS"])
        .or(`remind_at.lte.${horizon},due_at.lte.${horizon}`)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(maxRows),
    ),
    rows(
      supabaseAdmin
        .from("secretary_follow_ups")
        .select("id,owner_party_id,contact_party_id,task_id,calendar_event_id,call_id,conversation_id,action_type,reason,status,due_at,metadata")
        .eq("organization_id", organizationId)
        .eq("status", "PENDING")
        .lte("due_at", horizon)
        .order("due_at", { ascending: true })
        .limit(maxRows),
    ),
    rows(
      supabaseAdmin
        .from("secretary_calendar_events")
        .select("id,owner_party_id,contact_party_id,title,description,event_type,status,starts_at,ends_at,timezone,location,metadata")
        .eq("organization_id", organizationId)
        .in("status", ["TENTATIVE", "CONFIRMED"])
        .gte("starts_at", now)
        .lte("starts_at", horizon)
        .order("starts_at", { ascending: true })
        .limit(maxRows),
    ),
    rows(
      supabaseAdmin
        .from("secretary_calls")
        .select("id,contact_party_id,conversation_id,direction,remote_address,status,started_at,summary,metadata")
        .eq("organization_id", organizationId)
        .eq("direction", "INBOUND")
        .in("status", ["MISSED", "VOICEMAIL"])
        .gte("started_at", new Date(Date.parse(now) - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("started_at", { ascending: false })
        .limit(maxRows),
    ),
  ]);

  const taskItems = tasks.filter((task) => {
    const remind = task.remind_at ? Date.parse(task.remind_at) : Number.POSITIVE_INFINITY;
    const due = task.due_at ? Date.parse(task.due_at) : Number.POSITIVE_INFINITY;
    return Math.min(remind, due) <= Date.parse(horizon);
  }).map((task) => ({
    kind: "task",
    id: task.id,
    due_at: task.remind_at || task.due_at,
    overdue: Boolean(task.due_at && Date.parse(task.due_at) <= Date.parse(now)),
    priority: task.priority,
    title: task.title,
    details: task.details,
    owner_party_id: task.owner_party_id,
    contact_party_id: task.contact_party_id,
    source: task,
  }));

  const followUpItems = followUps.map((followUp) => ({
    kind: "follow_up",
    id: followUp.id,
    due_at: followUp.due_at,
    overdue: Date.parse(followUp.due_at) <= Date.parse(now),
    priority: "NORMAL",
    title: followUp.reason,
    action_type: followUp.action_type,
    owner_party_id: followUp.owner_party_id,
    contact_party_id: followUp.contact_party_id,
    source: followUp,
  }));

  const eventItems = events.map((event) => ({
    kind: "calendar_event",
    id: event.id,
    due_at: event.starts_at,
    overdue: false,
    priority: "NORMAL",
    title: event.title,
    event_type: event.event_type,
    owner_party_id: event.owner_party_id,
    contact_party_id: event.contact_party_id,
    source: event,
  }));

  const missedCallItems = missedCalls.map((call) => ({
    kind: "missed_call",
    id: call.id,
    due_at: call.started_at,
    overdue: true,
    priority: "HIGH",
    title: call.summary || `Missed call${call.remote_address ? ` from ${call.remote_address}` : ""}`,
    contact_party_id: call.contact_party_id,
    conversation_id: call.conversation_id,
    source: call,
  }));

  const items = [...taskItems, ...followUpItems, ...eventItems, ...missedCallItems]
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      const priority = { URGENT: 4, HIGH: 3, NORMAL: 2, LOW: 1 };
      const priorityDiff = (priority[b.priority] || 0) - (priority[a.priority] || 0);
      if (priorityDiff) return priorityDiff;
      return Date.parse(a.due_at || horizon) - Date.parse(b.due_at || horizon);
    })
    .slice(0, maxRows);

  return {
    status: "completed",
    contract: "AVANTIQO_SECRETARY_DUE_WORK_V1",
    now,
    horizon,
    horizon_hours: horizonHours,
    counts: {
      tasks: taskItems.length,
      follow_ups: followUpItems.length,
      upcoming_events: eventItems.length,
      missed_calls: missedCallItems.length,
      total: items.length,
      overdue: items.filter((item) => item.overdue).length,
    },
    items,
    external_authority_used: false,
  };
}

export default scanSecretaryDueWork;
