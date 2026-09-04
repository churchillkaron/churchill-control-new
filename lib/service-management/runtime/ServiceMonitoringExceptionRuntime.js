import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTIVE_CHECK_STATUSES = new Set(["recorded", "validated"]);
const ACTIVE_ACTION_STATUSES = new Set(["draft", "assigned", "released", "in_progress", "paused", "reopened"]);
const COMPLETED_ACTION_STATUSES = new Set(["completed"]);
const BAD_CONDITIONS = new Set(["damaged", "missing", "blocked", "contaminated", "replacement_required"]);
const REPEAT_ACTIVITY_LEVELS = new Set(["low", "medium", "high", "critical"]);

function text(value, max = 500) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, max) : "";
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function dateValue(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function millis(value) {
  return dateValue(value)?.getTime() || 0;
}

function monitoringPoint(record = {}) {
  return record.attributes?.monitoring_point || null;
}

function monitoringCheck(record = {}) {
  return record.attributes?.monitoring_point_check || null;
}

function correctiveAction(record = {}) {
  return record.attributes?.monitoring_corrective_action || null;
}

function badCheck(check = {}) {
  return BAD_CONDITIONS.has(normalized(check.condition))
    || REPEAT_ACTIVITY_LEVELS.has(normalized(check.activity_level))
    || Number(check.count || 0) > 0;
}

function consecutiveBadChecks(checks = []) {
  let count = 0;
  for (const check of checks) {
    if (!badCheck(check)) break;
    count += 1;
  }
  return count;
}

function classify({ latest, checks }) {
  if (!latest) return null;
  const condition = normalized(latest.condition);
  const activity = normalized(latest.activity_level);
  const streak = consecutiveBadChecks(checks);
  const signals = [];

  if (activity === "critical") signals.push("critical_activity");
  else if (activity === "high") signals.push("high_activity");
  if (condition === "missing") signals.push("missing_point");
  if (condition === "replacement_required") signals.push("replacement_required");
  if (condition === "damaged") signals.push("damaged_point");
  if (condition === "blocked") signals.push("blocked_point");
  if (condition === "contaminated") signals.push("contaminated_point");
  if (streak >= 3) signals.push("repeat_pattern");

  if (!signals.length) return null;

  const critical = signals.some((signal) => ["critical_activity", "missing_point", "replacement_required"].includes(signal));
  const severity = critical ? "critical" : "high";
  const dueHours = critical ? 24 : 48;
  const recommendation = signals.includes("missing_point")
    ? "Locate or replace the missing point, verify placement, then recheck site coverage."
    : signals.includes("replacement_required") || signals.includes("damaged_point")
      ? "Repair or replace the monitoring point and verify the replacement with a governed field check."
      : signals.includes("blocked_point") || signals.includes("contaminated_point")
        ? "Restore the point to serviceable condition, inspect the surrounding area, and recheck activity."
        : signals.includes("critical_activity") || signals.includes("high_activity")
          ? "Review treatment and site conditions, decide follow-up treatment, and verify the point after intervention."
          : "Review the repeated pattern, identify the likely site cause, and decide a corrective intervention before the next routine visit.";

  return { severity, due_hours: dueHours, signals, repeat_streak: streak, recommendation };
}

async function loadRecords({ context }) {
  const organizationId = context.organization_id;
  let equipmentQuery = supabaseAdmin
    .from("operations_records")
    .select("id,status,name,entity_id,created_at,updated_at,attributes")
    .eq("organization_id", organizationId)
    .eq("capability_id", "equipment")
    .limit(5000);
  let checksQuery = supabaseAdmin
    .from("operations_records")
    .select("id,status,source_id,entity_id,created_at,updated_at,attributes")
    .eq("organization_id", organizationId)
    .eq("capability_id", "activities")
    .eq("source_domain", "service-management")
    .eq("source_type", "monitoring-point-check")
    .in("status", [...ACTIVE_CHECK_STATUSES])
    .order("created_at", { ascending: false })
    .limit(10000);
  let actionsQuery = supabaseAdmin
    .from("operations_records")
    .select("id,status,name,description,priority,assigned_to,due_at,source_id,entity_id,created_at,updated_at,attributes,allowed_commands")
    .eq("organization_id", organizationId)
    .eq("capability_id", "corrective-actions")
    .eq("source_domain", "service-management")
    .eq("source_type", "monitoring-point")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (context.entity_id) {
    equipmentQuery = equipmentQuery.or(`entity_id.eq.${context.entity_id},entity_id.is.null`);
    checksQuery = checksQuery.or(`entity_id.eq.${context.entity_id},entity_id.is.null`);
    actionsQuery = actionsQuery.or(`entity_id.eq.${context.entity_id},entity_id.is.null`);
  }

  const [equipmentResult, checksResult, actionsResult] = await Promise.all([equipmentQuery, checksQuery, actionsQuery]);
  if (equipmentResult.error) throw equipmentResult.error;
  if (checksResult.error) throw checksResult.error;
  if (actionsResult.error) throw actionsResult.error;

  return {
    equipment: equipmentResult.data || [],
    checks: checksResult.data || [],
    actions: actionsResult.data || [],
  };
}

export async function getMonitoringExceptions({ context }) {
  if (!context?.organization_id) {
    const error = new Error("Monitoring exception intelligence requires organization_id.");
    error.status = 400;
    throw error;
  }

  const { equipment, checks, actions } = await loadRecords({ context });
  const points = equipment.filter((record) => monitoringPoint(record)?.industry_key === "pest-control" && normalized(record.status) === "active");
  const pointIds = new Set(points.map((record) => record.id));
  const checksByPoint = new Map();
  const actionsByPoint = new Map();

  for (const row of checks) {
    if (!pointIds.has(row.source_id)) continue;
    const check = monitoringCheck(row);
    if (!check) continue;
    const bucket = checksByPoint.get(row.source_id) || [];
    bucket.push({ id: row.id, status: row.status, created_at: row.created_at, updated_at: row.updated_at, ...check });
    checksByPoint.set(row.source_id, bucket);
  }

  for (const row of actions) {
    if (!pointIds.has(row.source_id)) continue;
    if (!correctiveAction(row)) continue;
    const bucket = actionsByPoint.get(row.source_id) || [];
    bucket.push(row);
    actionsByPoint.set(row.source_id, bucket);
  }

  const rows = [];
  const resolved = [];
  for (const record of points) {
    const point = monitoringPoint(record) || {};
    const pointChecks = (checksByPoint.get(record.id) || []).sort((a, b) => millis(b.checked_at || b.created_at) - millis(a.checked_at || a.created_at));
    const latest = pointChecks[0] || null;
    const classification = classify({ latest, checks: pointChecks });
    if (!classification) continue;

    const triggerAt = latest.checked_at || latest.created_at;
    const pointActions = (actionsByPoint.get(record.id) || []).sort((a, b) => millis(b.updated_at || b.created_at) - millis(a.updated_at || a.created_at));
    const activeAction = pointActions.find((action) => ACTIVE_ACTION_STATUSES.has(normalized(action.status))) || null;
    const completedAfterTrigger = pointActions.find((action) => (
      COMPLETED_ACTION_STATUSES.has(normalized(action.status))
      && millis(action.updated_at || action.created_at) >= millis(triggerAt)
    )) || null;

    const projected = {
      point_id: record.id,
      point_code: point.code || record.name || record.id,
      point_type: point.point_type || null,
      point_type_label: point.point_type_label || null,
      customer_party_id: point.customer_party_id || null,
      customer_name: point.customer_name || null,
      customer_location_id: point.customer_location_id || null,
      customer_location_name: point.customer_location_name || null,
      area: point.area || null,
      placement: point.placement || null,
      severity: classification.severity,
      signals: classification.signals,
      repeat_streak: classification.repeat_streak,
      recommendation: classification.recommendation,
      due_hours: classification.due_hours,
      trigger_check_id: latest.id,
      trigger_at: triggerAt,
      latest_check: latest,
      recent_checks: pointChecks.slice(0, 5),
      active_action: activeAction ? {
        id: activeAction.id,
        status: activeAction.status,
        assigned_to: activeAction.assigned_to || null,
        priority: activeAction.priority || null,
        due_at: activeAction.due_at || null,
        allowed_commands: activeAction.allowed_commands || [],
        created_at: activeAction.created_at,
        updated_at: activeAction.updated_at,
        details: correctiveAction(activeAction),
      } : null,
    };

    if (completedAfterTrigger && !activeAction) {
      resolved.push({ ...projected, resolved_action_id: completedAfterTrigger.id, resolved_at: completedAfterTrigger.updated_at || completedAfterTrigger.created_at });
      continue;
    }
    rows.push(projected);
  }

  rows.sort((a, b) => {
    if (a.active_action && !b.active_action) return 1;
    if (!a.active_action && b.active_action) return -1;
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    if (b.repeat_streak !== a.repeat_streak) return b.repeat_streak - a.repeat_streak;
    return millis(b.trigger_at) - millis(a.trigger_at);
  });

  return {
    rows,
    resolved: resolved.slice(0, 100),
    metrics: {
      needs_action: rows.filter((row) => !row.active_action).length,
      in_progress: rows.filter((row) => Boolean(row.active_action)).length,
      critical: rows.filter((row) => row.severity === "critical").length,
      repeat_patterns: rows.filter((row) => row.signals.includes("repeat_pattern")).length,
      resolved_recent: resolved.length,
    },
    authority: {
      evidence: "operations.activities",
      point_master: "operations.equipment",
      corrective_action: "operations.corrective-actions",
      rule: "Signals are deterministic projections from governed monitoring evidence. Human action creates and owns the canonical corrective-action record; completed actions suppress the signal until newer bad evidence appears.",
    },
  };
}

export async function getMonitoringException({ context, pointId }) {
  const data = await getMonitoringExceptions({ context });
  return data.rows.find((row) => row.point_id === pointId) || null;
}

export default Object.freeze({ getMonitoringExceptions, getMonitoringException });
