import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MAX_SIGNAL_KEY = 240;
const ALLOWED_ACTIONS = new Set(["ACKNOWLEDGE", "RESOLVE", "REOPEN"]);

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function validSignalKey(value) {
  const key = text(value);
  return key.length > 0 && key.length <= MAX_SIGNAL_KEY && key.startsWith("usage:");
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

async function loadUsageSignal(signalKey) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin.rpc("platform_operator_usage_failure_detail", {
    p_signal_key: signalKey,
    p_since: since,
  });
  if (error) throw error;

  const detail = data || {};
  const summary = detail?.summary || {};
  if (number(summary?.occurrence_count) <= 0) return null;

  const organizationId = text(summary?.organization_id) || null;
  let organization = null;
  if (organizationId) {
    const { data: row, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("id,name,legal_name,display_name,status")
      .eq("id", organizationId)
      .maybeSingle();
    if (orgError) throw orgError;
    organization = row || null;
  }

  return {
    signalKey,
    category: "service_execution",
    organizationId,
    organization,
    source: "platform_service_usage",
    title: titleFor(summary),
    severity: severityFor(summary),
    firstSeenAt: summary?.first_seen_at || null,
    lastSeenAt: summary?.last_seen_at || null,
    occurrenceCount: number(summary?.occurrence_count),
    evidenceVersion: `${summary?.last_seen_at || "unknown"}:${number(summary?.occurrence_count)}`,
    detail,
  };
}

async function loadCase(signalKey) {
  const { data, error } = await supabaseAdmin
    .from("platform_operator_cases")
    .select("*")
    .eq("signal_key", signalKey)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadHistory(signalKey) {
  const { data, error } = await supabaseAdmin
    .from("platform_operator_case_events")
    .select("id,action,from_status,to_status,actor_staff_id,note,evidence_version,created_at")
    .eq("signal_key", signalKey)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

function effectiveCase(persistedCase, signal) {
  if (!persistedCase) return { status: "OPEN", reopenedByEvidence: false };
  const resolvedAt = new Date(persistedCase.resolved_at || 0).getTime();
  const lastSeenAt = new Date(signal?.lastSeenAt || 0).getTime();
  const reopenedByEvidence = persistedCase.status === "RESOLVED" && Number.isFinite(resolvedAt) && Number.isFinite(lastSeenAt) && lastSeenAt > resolvedAt;
  return {
    ...persistedCase,
    status: reopenedByEvidence ? "OPEN" : persistedCase.status,
    reopenedByEvidence,
  };
}

export async function GET(request) {
  const access = await requirePlatformAdminAccess();
  if (!access.success) return Response.json({ success: false, error: access.error }, { status: access.status });

  const signalKey = text(new URL(request.url).searchParams.get("signalKey"));
  if (!validSignalKey(signalKey)) {
    return Response.json({ success: false, error: "A supported operator signal key is required" }, { status: 400 });
  }

  try {
    const signal = await loadUsageSignal(signalKey);
    if (!signal) return Response.json({ success: false, error: "Signal is no longer present in the authoritative 24-hour evidence window" }, { status: 404 });
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
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const signalKey = text(body?.signalKey);
  const action = text(body?.action).toUpperCase();
  const note = text(body?.note) || null;
  if (!validSignalKey(signalKey)) return Response.json({ success: false, error: "A supported operator signal key is required" }, { status: 400 });
  if (!ALLOWED_ACTIONS.has(action)) return Response.json({ success: false, error: "Unsupported operator action" }, { status: 400 });
  if ((action === "RESOLVE" || action === "REOPEN") && !note) return Response.json({ success: false, error: `${action} requires a note` }, { status: 400 });

  try {
    const signal = await loadUsageSignal(signalKey);
    if (!signal) return Response.json({ success: false, error: "Signal is no longer present in authoritative evidence; no workflow mutation was made" }, { status: 409 });

    const snapshot = {
      summary: signal.detail?.summary || {},
      trend: signal.detail?.trend || [],
      organization: signal.organization || null,
    };

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
      p_evidence_snapshot: snapshot,
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
