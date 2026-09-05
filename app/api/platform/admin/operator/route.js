import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MAX_SIGNAL_KEY = 240;
const ALLOWED_ACTIONS = new Set(["ACKNOWLEDGE", "RESOLVE", "REOPEN"]);
const SYSTEM_EVENT_BACKLOG_KEY = "system-event-backlog";

function text(value) { return String(value ?? "").trim(); }
function number(value) { const parsed = Number(value || 0); return Number.isFinite(parsed) ? parsed : 0; }
function validSignalKey(value) {
  const key = text(value);
  return key.length > 0 && key.length <= MAX_SIGNAL_KEY && (key.startsWith("usage:") || key === SYSTEM_EVENT_BACKLOG_KEY);
}
function severityFor(summary) {
  const count = number(summary?.occurrence_count);
  const lastSeen = new Date(summary?.last_seen_at || 0).getTime();
  const fresh = Number.isFinite(lastSeen) && Date.now() - lastSeen <= 60 * 60 * 1000;
  if (fresh && count >= 25) return "critical";
  if (count >= 25) return "high";
  return "medium";
}
function titleFor(summary) {
  return `${text(summary?.provider || "Runtime provider")} · ${text(summary?.capability || "service execution")} is failing${new Date(summary?.last_seen_at || 0).getTime() > Date.now() - 60 * 60 * 1000 ? " now" : ""}`;
}
async function loadOrganization(organizationId) {
  if (!organizationId) return null;
  const { data, error } = await supabaseAdmin.from("organizations").select("id,name,legal_name,display_name,status").eq("id", organizationId).maybeSingle();
  if (error) throw error;
  return data || null;
}
async function loadUsageSignal(signalKey) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin.rpc("platform_operator_usage_failure_detail", { p_signal_key: signalKey, p_since: since });
  if (error) throw error;
  const detail = data || {};
  const summary = detail?.summary || {};
  if (number(summary?.occurrence_count) <= 0) return null;
  const organizationId = text(summary?.organization_id) || null;
  const organization = await loadOrganization(organizationId);
  return {
    signalKey, category: "service_execution", organizationId, organization, source: "platform_service_usage",
    title: titleFor(summary), severity: severityFor(summary), firstSeenAt: summary?.first_seen_at || null,
    lastSeenAt: summary?.last_seen_at || null, occurrenceCount: number(summary?.occurrence_count),
    evidenceVersion: `${summary?.last_seen_at || "unknown"}:${number(summary?.occurrence_count)}`, detail,
  };
}
async function loadSystemEventBacklog() {
  const { data, error } = await supabaseAdmin
    .from("system_events")
    .select("id,organization_id,type,payload,created_at,processed,processing,processing_started_at,attempt_count,last_error,last_failed_at")
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(250);
  if (error) throw error;
  const rows = data || [];
  if (!rows.length) return null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const organizationIds = [...new Set(rows.map(row => text(row.organization_id)).filter(Boolean))];
  const organizationId = organizationIds.length === 1 ? organizationIds[0] : null;
  const organization = await loadOrganization(organizationId);
  const attempted = rows.filter(row => number(row.attempt_count) > 0 || row.processing || row.last_failed_at || text(row.last_error));
  const neverAttempted = rows.length - attempted.length;
  const diagnosis = neverAttempted === rows.length
    ? "consumer_not_claiming"
    : attempted.length === rows.length
      ? "processing_or_retry_failure"
      : "mixed_backlog";
  const recent = [...rows].reverse().map(row => ({
    id: row.id,
    created_at: row.created_at,
    event_type: row.type,
    attempt_count: number(row.attempt_count),
    processing: Boolean(row.processing),
    last_error: row.last_error || null,
    last_failed_at: row.last_failed_at || null,
    quotation_number: row.payload?.quotation_number || null,
    quotation_id: row.payload?.quotation_id || null,
    payload_status: row.payload?.status || null,
  }));
  const summary = {
    occurrence_count: rows.length,
    first_seen_at: first.created_at,
    last_seen_at: last.created_at,
    organization_id: organizationId,
    never_attempted_count: neverAttempted,
    attempted_count: attempted.length,
    diagnosis,
    oldest_event_type: first.type,
    newest_event_type: last.type,
    error_message: attempted.length ? text(attempted.find(row => text(row.last_error))?.last_error) || null : null,
  };
  return {
    signalKey: SYSTEM_EVENT_BACKLOG_KEY,
    category: "event_processing",
    organizationId,
    organization,
    source: "system_events",
    title: diagnosis === "consumer_not_claiming" ? "System event consumer is not claiming queued events" : "System event backlog is not draining",
    severity: "high",
    firstSeenAt: first.created_at,
    lastSeenAt: last.created_at,
    occurrenceCount: rows.length,
    evidenceVersion: `${last.created_at}:${rows.length}:${attempted.length}`,
    detail: { summary, trend: [], recent },
  };
}
async function resolveSignal(signalKey) {
  if (signalKey === SYSTEM_EVENT_BACKLOG_KEY) return loadSystemEventBacklog();
  if (signalKey.startsWith("usage:")) return loadUsageSignal(signalKey);
  return null;
}
async function loadCase(signalKey) {
  const { data, error } = await supabaseAdmin.from("platform_operator_cases").select("*").eq("signal_key", signalKey).maybeSingle();
  if (error) throw error;
  return data || null;
}
async function loadHistory(signalKey) {
  const { data, error } = await supabaseAdmin.from("platform_operator_case_events").select("id,action,from_status,to_status,actor_staff_id,note,evidence_version,created_at").eq("signal_key", signalKey).order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return data || [];
}
function effectiveCase(persistedCase, signal) {
  if (!persistedCase) return { status: "OPEN", reopenedByEvidence: false };
  const resolvedAt = new Date(persistedCase.resolved_at || 0).getTime();
  const lastSeenAt = new Date(signal?.lastSeenAt || 0).getTime();
  const reopenedByEvidence = persistedCase.status === "RESOLVED" && Number.isFinite(resolvedAt) && Number.isFinite(lastSeenAt) && lastSeenAt > resolvedAt;
  return { ...persistedCase, status: reopenedByEvidence ? "OPEN" : persistedCase.status, reopenedByEvidence };
}
function evidenceSnapshot(signal) {
  return { summary: signal.detail?.summary || {}, trend: signal.detail?.trend || [], organization: signal.organization || null, recent: (signal.detail?.recent || []).slice(0, 20) };
}

export async function GET(request) {
  const access = await requirePlatformAdminAccess();
  if (!access.success) return Response.json({ success: false, error: access.error }, { status: access.status });
  const signalKey = text(new URL(request.url).searchParams.get("signalKey"));
  if (!validSignalKey(signalKey)) return Response.json({ success: false, error: "A supported operator signal key is required" }, { status: 400 });
  try {
    const signal = await resolveSignal(signalKey);
    if (!signal) return Response.json({ success: false, error: "Signal is no longer present in authoritative evidence" }, { status: 404 });
    const [persistedCase, history] = await Promise.all([loadCase(signalKey), loadHistory(signalKey)]);
    return Response.json({ success: true, signal, case: effectiveCase(persistedCase, signal), history });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || "Operator investigation failed" }, { status: 500 });
  }
}

export async function POST(request) {
  const access = await requirePlatformAdminAccess();
  if (!access.success) return Response.json({ success: false, error: access.error }, { status: access.status });
  let body;
  try { body = await request.json(); } catch { return Response.json({ success: false, error: "Invalid JSON body" }, { status: 400 }); }
  const signalKey = text(body?.signalKey);
  const action = text(body?.action).toUpperCase();
  const note = text(body?.note) || null;
  if (!validSignalKey(signalKey)) return Response.json({ success: false, error: "A supported operator signal key is required" }, { status: 400 });
  if (!ALLOWED_ACTIONS.has(action)) return Response.json({ success: false, error: "Unsupported operator action" }, { status: 400 });
  if ((action === "RESOLVE" || action === "REOPEN") && !note) return Response.json({ success: false, error: `${action} requires a note` }, { status: 400 });
  try {
    const signal = await resolveSignal(signalKey);
    if (!signal) return Response.json({ success: false, error: "Signal is no longer present in authoritative evidence; no workflow mutation was made" }, { status: 409 });
    const { data: result, error } = await supabaseAdmin.rpc("platform_operator_apply_case_action", {
      p_signal_key: signal.signalKey,
      p_category: signal.category,
      p_organization_id: signal.organizationId,
      p_source: signal.source,
      p_title: signal.title,
      p_severity: signal.severity,
      p_action: action,
      p_actor_user_id: access.user?.id || null,
      p_actor_staff_id: access.staff?.id || null,
      p_note: note,
      p_evidence_version: signal.evidenceVersion,
      p_first_seen_at: signal.firstSeenAt,
      p_last_seen_at: signal.lastSeenAt,
      p_occurrence_count: signal.occurrenceCount,
      p_evidence_snapshot: evidenceSnapshot(signal),
    });
    if (error) {
      const status = /acknowledge|reopen|requires|unsupported/i.test(error.message || "") ? 409 : 500;
      return Response.json({ success: false, error: error.message }, { status });
    }
    const [persistedCase, history] = await Promise.all([loadCase(signalKey), loadHistory(signalKey)]);
    return Response.json({ success: true, signal, case: effectiveCase(persistedCase || result, signal), history });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || "Operator case action failed" }, { status: 500 });
  }
}
