import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MAX_SIGNAL_KEY = 240;
const ALLOWED_ACTIONS = new Set(["ACKNOWLEDGE", "RESOLVE", "REOPEN"]);
const SYSTEM_EVENT_BACKLOG_KEY = "system-event-backlog";
const SYSTEM_ALERT_PREFIX = "system-alert:";
const SECURITY_INCIDENT_PREFIX = "security-incident:";

function text(value) { return String(value ?? "").trim(); }
function number(value) { const parsed = Number(value || 0); return Number.isFinite(parsed) ? parsed : 0; }
function timestamp(value) { const parsed = new Date(value || 0).getTime(); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
function severityWeight(value) {
  const severity = text(value).toLowerCase();
  if (severity === "critical") return 4;
  if (severity === "high") return 3;
  if (severity === "medium" || severity === "warning") return 2;
  return 1;
}
function rankedSeverity(sourceSeverity, latestAt) {
  const at = timestamp(latestAt);
  const hours = at ? Math.max(0, (Date.now() - at) / 3_600_000) : null;
  const weight = severityWeight(sourceSeverity);
  if (hours !== null && hours <= 24) return weight >= 4 ? "critical" : weight >= 3 ? "high" : "medium";
  if (hours !== null && hours <= 24 * 7) return weight >= 4 ? "high" : "medium";
  if (hours !== null && hours <= 24 * 30) return weight >= 4 ? "medium" : "low";
  return "medium";
}
function highestSeverity(rows) {
  return (rows || []).reduce((best, row) => severityWeight(row?.severity) > severityWeight(best) ? row?.severity : best, "low");
}
function validSignalKey(value) {
  const key = text(value);
  return key.length > 0 && key.length <= MAX_SIGNAL_KEY && (
    key.startsWith("usage:") ||
    key === SYSTEM_EVENT_BACKLOG_KEY ||
    key.startsWith(SYSTEM_ALERT_PREFIX) ||
    key.startsWith(SECURITY_INCIDENT_PREFIX)
  );
}
function systemAlertKey(row) {
  return `${SYSTEM_ALERT_PREFIX}${text(row?.title || row?.alert_type)}:${text(row?.organization_id) || "platform"}`;
}
function securityIncidentKey(row) {
  return `${SECURITY_INCIDENT_PREFIX}${text(row?.incident_type)}:${text(row?.incident_summary)}`;
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
  const { data, error } = await supabaseAdmin.from("organizations").select("id,name,legal_name,status").eq("id", organizationId).maybeSingle();
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
async function evaluateAlertRemediation(rows) {
  const alertTypes = [...new Set((rows || []).map(row => text(row.alert_type).toUpperCase()).filter(Boolean))];
  if (alertTypes.length === 1 && alertTypes[0] === "TEST") {
    return {
      verified: true,
      reason: "test_artifact",
      explanation: "All matching source rows are explicitly typed TEST and have no production source reference.",
      affected: [],
      liveOrganizationId: null,
    };
  }
  if (alertTypes.length !== 1 || alertTypes[0] !== "MISSING_RECIPE") {
    return {
      verified: false,
      reason: "no_source_specific_verifier",
      explanation: "No governed remediation verifier is defined for this alert type.",
      affected: [],
      liveOrganizationId: null,
    };
  }

  const dishIds = [...new Set((rows || []).map(row => text(row.source_id)).filter(Boolean))];
  if (!dishIds.length) {
    return {
      verified: false,
      reason: "missing_source_reference",
      explanation: "The alert has no dish source reference, so remediation cannot be verified safely.",
      affected: [],
      liveOrganizationId: null,
    };
  }

  const [dishesResult, recipesResult] = await Promise.all([
    supabaseAdmin.from("dishes").select("id,name,organization_id,production_type").in("id", dishIds),
    supabaseAdmin.from("recipes").select("id,dish_id,organization_id,qty_per_dish").in("dish_id", dishIds),
  ]);
  if (dishesResult.error) throw dishesResult.error;
  if (recipesResult.error) throw recipesResult.error;

  const dishes = dishesResult.data || [];
  const recipes = recipesResult.data || [];
  const recipeCounts = new Map();
  for (const recipe of recipes) recipeCounts.set(text(recipe.dish_id), number(recipeCounts.get(text(recipe.dish_id))) + 1);
  const dishById = new Map(dishes.map(dish => [text(dish.id), dish]));
  const affected = dishIds.map(dishId => ({
    dish_id: dishId,
    dish_name: dishById.get(dishId)?.name || null,
    organization_id: dishById.get(dishId)?.organization_id || null,
    production_type: dishById.get(dishId)?.production_type || null,
    recipe_count: number(recipeCounts.get(dishId)),
    remediated: number(recipeCounts.get(dishId)) > 0,
  }));
  const liveOrganizations = [...new Set(affected.map(row => text(row.organization_id)).filter(Boolean))];
  const verified = affected.length === dishIds.length && affected.every(row => row.remediated);
  return {
    verified,
    reason: verified ? "recipes_now_present" : "recipe_still_missing",
    explanation: verified
      ? "Every referenced dish now has a persisted recipe. The source alert is stale and can be closed with positive remediation evidence."
      : "At least one referenced dish still lacks a persisted recipe, so the source alert must remain open.",
    affected,
    liveOrganizationId: liveOrganizations.length === 1 ? liveOrganizations[0] : null,
  };
}
async function loadSystemAlertSignal(signalKey) {
  const { data, error } = await supabaseAdmin
    .from("system_alerts")
    .select("id,organization_id,alert_type,severity,title,message,source,source_id,status,created_at,resolved_at")
    .is("resolved_at", null)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  const rows = (data || []).filter(row => text(row.status || "OPEN").toUpperCase() !== "RESOLVED" && systemAlertKey(row) === signalKey);
  if (!rows.length) return null;

  const first = rows[0];
  const last = rows[rows.length - 1];
  const sourceSeverity = highestSeverity(rows);
  const remediation = await evaluateAlertRemediation(rows);
  const sourceOrganizationId = text(last.organization_id) || null;
  const organizationId = remediation.liveOrganizationId || sourceOrganizationId;
  const organization = await loadOrganization(organizationId);
  const summary = {
    occurrence_count: rows.length,
    first_seen_at: first.created_at,
    last_seen_at: last.created_at,
    organization_id: organizationId,
    source_organization_id: sourceOrganizationId,
    alert_type: last.alert_type,
    persisted_severity: sourceSeverity,
    message: last.message || null,
    remediation_verified: remediation.verified,
    remediation_reason: remediation.reason,
    remediation_explanation: remediation.explanation,
  };
  const recent = [...rows].reverse().map(row => ({
    id: row.id,
    created_at: row.created_at,
    alert_type: row.alert_type,
    severity: row.severity,
    status: row.status,
    source: row.source,
    source_id: row.source_id,
    message: row.message,
  }));
  return {
    signalKey,
    category: "system_alert",
    organizationId,
    organization,
    source: "system_alerts",
    title: `${rows.length} unresolved alert${rows.length === 1 ? "" : "s"} · ${text(last.title || last.alert_type || "System alert")}`,
    severity: rankedSeverity(sourceSeverity, last.created_at),
    firstSeenAt: first.created_at,
    lastSeenAt: last.created_at,
    occurrenceCount: rows.length,
    evidenceVersion: `${last.created_at}:${rows.length}:${remediation.reason}`,
    forceOpenWhileSourceOpen: true,
    sourceMutation: true,
    detail: { summary, trend: [], recent, affected: remediation.affected, source_rows: rows.map(row => ({ id: row.id })) },
  };
}
async function loadSecurityIncidentSignal(signalKey) {
  const { data, error } = await supabaseAdmin
    .from("enterprise_security_incidents")
    .select("id,organization_id,incident_type,incident_category,severity,incident_status,source_system,reference_table,reference_id,detected_by,assigned_to,incident_summary,incident_details,resolution_notes,resolved_at,created_at,updated_at")
    .is("resolved_at", null)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  const rows = (data || []).filter(row => !["RESOLVED", "CLOSED"].includes(text(row.incident_status).toUpperCase()) && securityIncidentKey(row) === signalKey);
  if (!rows.length) return null;

  const first = rows[0];
  const last = rows[rows.length - 1];
  const sourceSeverity = highestSeverity(rows);
  const workflows = [...new Set(rows.map(row => text(row.detected_by || row.incident_details?.workflow)).filter(Boolean))];
  let successes = [];
  if (workflows.length) {
    const { data: successRows, error: successError } = await supabaseAdmin
      .from("workflow_logs")
      .select("id,organization_id,workflow,event,status,error,retry_count,replayable,dead_letter,created_at,completed_at")
      .in("workflow", workflows)
      .eq("status", "SUCCESS")
      .gt("created_at", last.created_at)
      .order("created_at", { ascending: true })
      .limit(100);
    if (successError) throw successError;
    successes = successRows || [];
  }
  const successfulWorkflows = new Set(successes.map(row => text(row.workflow)));
  const remediationVerified = workflows.length > 0 && workflows.every(workflow => successfulWorkflows.has(workflow));
  const inferredOrganizations = [...new Set([...rows, ...successes].map(row => text(row.organization_id)).filter(Boolean))];
  const organizationId = inferredOrganizations.length === 1 ? inferredOrganizations[0] : text(last.organization_id) || null;
  const organization = await loadOrganization(organizationId);
  const latestSuccess = successes[successes.length - 1] || null;
  const summary = {
    occurrence_count: rows.length,
    first_seen_at: first.created_at,
    last_seen_at: last.created_at,
    organization_id: organizationId,
    incident_type: last.incident_type,
    incident_category: last.incident_category,
    persisted_severity: sourceSeverity,
    workflow: workflows.join(", ") || null,
    remediation_verified: remediationVerified,
    remediation_reason: remediationVerified ? "later_successful_workflow_run" : "no_later_successful_run",
    remediation_explanation: remediationVerified
      ? "The same workflow completed successfully after the latest incident. The persisted incident is stale and can be closed with positive runtime evidence."
      : "No later successful execution proves that this workflow condition recovered, so the incident must remain open.",
    latest_success_at: latestSuccess?.created_at || null,
  };
  const recent = [...rows].reverse().map(row => ({
    id: row.id,
    created_at: row.created_at,
    incident_type: row.incident_type,
    incident_status: row.incident_status,
    workflow: row.detected_by || row.incident_details?.workflow || null,
    event: row.incident_details?.event || null,
    error: row.incident_details?.error || null,
  }));
  return {
    signalKey,
    category: "security_incident",
    organizationId,
    organization,
    source: "enterprise_security_incidents",
    title: `${rows.length} unresolved incident${rows.length === 1 ? "" : "s"} · ${text(last.incident_type || "Security incident")}`,
    severity: rankedSeverity(sourceSeverity, last.created_at),
    firstSeenAt: first.created_at,
    lastSeenAt: last.created_at,
    occurrenceCount: rows.length,
    evidenceVersion: `${last.created_at}:${rows.length}:${remediationVerified ? latestSuccess?.created_at || "verified" : "unverified"}`,
    forceOpenWhileSourceOpen: true,
    sourceMutation: true,
    detail: { summary, trend: [], recent, remediation: successes, source_rows: rows.map(row => ({ id: row.id })) },
  };
}
async function resolveSignal(signalKey) {
  if (signalKey === SYSTEM_EVENT_BACKLOG_KEY) return loadSystemEventBacklog();
  if (signalKey.startsWith("usage:")) return loadUsageSignal(signalKey);
  if (signalKey.startsWith(SYSTEM_ALERT_PREFIX)) return loadSystemAlertSignal(signalKey);
  if (signalKey.startsWith(SECURITY_INCIDENT_PREFIX)) return loadSecurityIncidentSignal(signalKey);
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
  if (signal?.forceOpenWhileSourceOpen && persistedCase.status === "RESOLVED") {
    return { ...persistedCase, status: "OPEN", reopenedByEvidence: true };
  }
  const resolvedAt = new Date(persistedCase.resolved_at || 0).getTime();
  const lastSeenAt = new Date(signal?.lastSeenAt || 0).getTime();
  const reopenedByEvidence = persistedCase.status === "RESOLVED" && Number.isFinite(resolvedAt) && Number.isFinite(lastSeenAt) && lastSeenAt > resolvedAt;
  return { ...persistedCase, status: reopenedByEvidence ? "OPEN" : persistedCase.status, reopenedByEvidence };
}
function evidenceSnapshot(signal) {
  return {
    summary: signal.detail?.summary || {},
    trend: signal.detail?.trend || [],
    organization: signal.organization || null,
    recent: (signal.detail?.recent || []).slice(0, 20),
    affected: (signal.detail?.affected || []).slice(0, 50),
    remediation: (signal.detail?.remediation || []).slice(0, 50),
  };
}
async function resolveAuthoritativeSource(signal, note) {
  const ids = (signal?.detail?.source_rows || []).map(row => text(row.id)).filter(Boolean);
  if (!ids.length) throw new Error("Authoritative source rows are unavailable for resolution");
  const now = new Date().toISOString();
  if (signal.category === "system_alert") {
    const { data, error } = await supabaseAdmin
      .from("system_alerts")
      .update({ status: "RESOLVED", resolved_at: now })
      .in("id", ids)
      .is("resolved_at", null)
      .select("id");
    if (error) throw error;
    if ((data || []).length !== ids.length) throw new Error("Not all source alerts were resolved; operator case will be reopened");
    return { source: "system_alerts", resolvedCount: data.length, resolvedAt: now };
  }
  if (signal.category === "security_incident") {
    const { data, error } = await supabaseAdmin
      .from("enterprise_security_incidents")
      .update({ incident_status: "RESOLVED", resolved_at: now, resolution_notes: note, updated_at: now })
      .in("id", ids)
      .is("resolved_at", null)
      .select("id");
    if (error) throw error;
    if ((data || []).length !== ids.length) throw new Error("Not all source incidents were resolved; operator case will be reopened");
    return { source: "enterprise_security_incidents", resolvedCount: data.length, resolvedAt: now };
  }
  return null;
}
async function applyCaseAction(signal, action, note, access) {
  return supabaseAdmin.rpc("platform_operator_apply_case_action", {
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
    if (action === "RESOLVE" && signal.sourceMutation && signal.detail?.summary?.remediation_verified !== true) {
      return Response.json({ success: false, error: signal.detail?.summary?.remediation_explanation || "Authoritative remediation has not been verified; source resolution is blocked" }, { status: 409 });
    }

    const { data: result, error } = await applyCaseAction(signal, action, note, access);
    if (error) {
      const status = /acknowledge|reopen|requires|unsupported/i.test(error.message || "") ? 409 : 500;
      return Response.json({ success: false, error: error.message }, { status });
    }

    let sourceResolution = null;
    if (action === "RESOLVE" && signal.sourceMutation) {
      try {
        sourceResolution = await resolveAuthoritativeSource(signal, note);
      } catch (sourceError) {
        await applyCaseAction(signal, "REOPEN", `Automatic reopen: authoritative source resolution failed: ${text(sourceError?.message) || "unknown error"}`, access).catch(() => null);
        return Response.json({ success: false, error: sourceError?.message || "Authoritative source resolution failed; case was reopened" }, { status: 500 });
      }
    }

    const [persistedCase, history] = await Promise.all([loadCase(signalKey), loadHistory(signalKey)]);
    return Response.json({ success: true, signal, case: effectiveCase(persistedCase || result, sourceResolution ? { ...signal, forceOpenWhileSourceOpen: false } : signal), history, sourceResolution });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || "Operator case action failed" }, { status: 500 });
  }
}
