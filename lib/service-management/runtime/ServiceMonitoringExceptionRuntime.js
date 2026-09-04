import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTIVE_CHECK_STATUSES = new Set(["recorded", "validated"]);
const ACTIVE_ACTION_STATUSES = new Set(["draft", "assigned", "released", "in_progress", "paused", "reopened"]);
const COMPLETED_ACTION_STATUSES = new Set(["complete", "completed"]);
const COMPLETED_WORK_STATUSES = new Set(["complete", "completed"]);
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

function monitoringFollowUp(record = {}) {
  return record.attributes?.monitoring_follow_up || null;
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

function verificationProjection({ action, workOrder, checks }) {
  const actionDetails = correctiveAction(action) || {};
  const saved = actionDetails.verification || null;
  const workCompleted = Boolean(workOrder && COMPLETED_WORK_STATUSES.has(normalized(workOrder.status)));
  const workCompletedAt = workCompleted
    ? workOrder.completed_at || workOrder.updated_at || workOrder.created_at || null
    : null;
  const postWorkChecks = workCompletedAt
    ? checks.filter((check) => millis(check.checked_at || check.created_at) > millis(workCompletedAt))
    : [];
  const latestPostWorkCheck = postWorkChecks[0] || null;
  const checksThroughVerification = latestPostWorkCheck
    ? checks.filter((check) => millis(check.checked_at || check.created_at) <= millis(latestPostWorkCheck.checked_at || latestPostWorkCheck.created_at))
    : [];
  const postWorkException = latestPostWorkCheck
    ? classify({ latest: latestPostWorkCheck, checks: checksThroughVerification })
    : null;
  const actionStatus = normalized(action?.status);

  let state = "work_not_created";
  if (saved?.verified_check_id && saved?.verified_at && COMPLETED_ACTION_STATUSES.has(actionStatus)) state = "verified";
  else if (COMPLETED_ACTION_STATUSES.has(actionStatus)) state = "completed_unverified";
  else if (!workOrder) state = "work_not_created";
  else if (!workCompleted) state = "work_in_progress";
  else if (!latestPostWorkCheck) state = "check_required";
  else if (postWorkException) state = "failed";
  else state = "ready";

  return {
    state,
    work_completed: workCompleted,
    work_completed_at: workCompletedAt,
    post_work_check: latestPostWorkCheck,
    post_work_signals: postWorkException?.signals || [],
    post_work_severity: postWorkException?.severity || null,
    healthy: state === "ready" || state === "verified",
    saved,
    can_verify: state === "ready" && actionStatus === "in_progress",
  };
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
    .select("*")
    .eq("organization_id", organizationId)
    .eq("capability_id", "corrective-actions")
    .eq("source_domain", "service-management")
    .eq("source_type", "monitoring-point")
    .order("created_at", { ascending: false })
    .limit(5000);
  let workOrdersQuery = supabaseAdmin
    .from("operations_records")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("capability_id", "work-orders")
    .eq("source_domain", "service-management")
    .eq("source_type", "monitoring-corrective-action")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (context.entity_id) {
    equipmentQuery = equipmentQuery.or(`entity_id.eq.${context.entity_id},entity_id.is.null`);
    checksQuery = checksQuery.or(`entity_id.eq.${context.entity_id},entity_id.is.null`);
    actionsQuery = actionsQuery.or(`entity_id.eq.${context.entity_id},entity_id.is.null`);
    workOrdersQuery = workOrdersQuery.or(`entity_id.eq.${context.entity_id},entity_id.is.null`);
  }

  const [equipmentResult, checksResult, actionsResult, workOrdersResult] = await Promise.all([
    equipmentQuery,
    checksQuery,
    actionsQuery,
    workOrdersQuery,
  ]);
  if (equipmentResult.error) throw equipmentResult.error;
  if (checksResult.error) throw checksResult.error;
  if (actionsResult.error) throw actionsResult.error;
  if (workOrdersResult.error) throw workOrdersResult.error;

  return {
    equipment: equipmentResult.data || [],
    checks: checksResult.data || [],
    actions: actionsResult.data || [],
    workOrders: workOrdersResult.data || [],
  };
}

function actionProjection({ action, workOrders, checks }) {
  if (!action) return null;
  const linkedWorkOrders = (workOrders || [])
    .filter((row) => row.source_id === action.id && monitoringFollowUp(row))
    .sort((a, b) => millis(b.updated_at || b.created_at) - millis(a.updated_at || a.created_at));
  const workOrder = linkedWorkOrders[0] || null;
  const verification = verificationProjection({ action, workOrder, checks });

  return {
    id: action.id,
    status: action.status,
    assigned_to: action.assigned_to || null,
    priority: action.priority || null,
    due_at: action.due_at || null,
    allowed_commands: action.allowed_commands || [],
    created_at: action.created_at,
    updated_at: action.updated_at,
    details: correctiveAction(action),
    follow_up_work_order_count: linkedWorkOrders.length,
    follow_up_work_order: workOrder ? {
      id: workOrder.id,
      status: workOrder.status,
      priority: workOrder.priority || null,
      assigned_to: workOrder.assigned_to || null,
      due_at: workOrder.due_at || null,
      completed_at: workOrder.completed_at || null,
      created_at: workOrder.created_at,
      updated_at: workOrder.updated_at,
      details: monitoringFollowUp(workOrder),
    } : null,
    verification,
  };
}

export async function getMonitoringExceptions({ context }) {
  if (!context?.organization_id) {
    const error = new Error("Monitoring exception intelligence requires organization_id.");
    error.status = 400;
    throw error;
  }

  const { equipment, checks, actions, workOrders } = await loadRecords({ context });
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
    if (!pointIds.has(row.source_id) || !correctiveAction(row)) continue;
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
    const currentClassification = classify({ latest, checks: pointChecks });
    const pointActions = (actionsByPoint.get(record.id) || []).sort((a, b) => millis(b.updated_at || b.created_at) - millis(a.updated_at || a.created_at));
    const latestAction = pointActions[0] || null;
    const latestActionDetails = correctiveAction(latestAction) || {};
    const latestActionStatus = normalized(latestAction?.status);
    const latestActionVerifiedAt = latestActionDetails.verification?.verified_at || null;
    const currentSignalAt = latest?.checked_at || latest?.created_at || null;
    const newSignalAfterVerifiedAction = Boolean(
      latestActionVerifiedAt
      && currentClassification
      && millis(currentSignalAt) > millis(latestActionVerifiedAt)
    );

    let actionForRow = null;
    if (latestAction && ACTIVE_ACTION_STATUSES.has(latestActionStatus)) actionForRow = latestAction;
    else if (latestAction && COMPLETED_ACTION_STATUSES.has(latestActionStatus) && !latestActionVerifiedAt) actionForRow = latestAction;

    if (!currentClassification && !actionForRow) {
      if (latestAction && COMPLETED_ACTION_STATUSES.has(latestActionStatus) && latestActionVerifiedAt) {
        resolved.push({
          point_id: record.id,
          point_code: point.code || record.name || record.id,
          customer_name: point.customer_name || null,
          customer_location_name: point.customer_location_name || null,
          resolved_action_id: latestAction.id,
          resolved_at: latestActionVerifiedAt,
          verification: latestActionDetails.verification,
        });
      }
      continue;
    }

    if (newSignalAfterVerifiedAction) actionForRow = null;
    else if (latestActionVerifiedAt && !actionForRow && currentClassification) {
      resolved.push({
        point_id: record.id,
        point_code: point.code || record.name || record.id,
        customer_name: point.customer_name || null,
        customer_location_name: point.customer_location_name || null,
        resolved_action_id: latestAction.id,
        resolved_at: latestActionVerifiedAt,
        verification: latestActionDetails.verification,
      });
      continue;
    }

    const actionDetails = correctiveAction(actionForRow) || {};
    const classification = currentClassification || {
      severity: actionDetails.severity || "high",
      due_hours: normalized(actionDetails.severity) === "critical" ? 24 : 48,
      signals: Array.isArray(actionDetails.signals) ? actionDetails.signals : [],
      repeat_streak: 0,
      recommendation: actionDetails.recommendation || "Verify the corrective intervention and close the operational loop.",
    };
    const activeAction = actionProjection({ action: actionForRow, workOrders, checks: pointChecks });
    const triggerCheckId = actionDetails.trigger_check_id || latest?.id || null;
    const triggerAt = actionDetails.trigger_at || currentSignalAt;

    rows.push({
      point_id: record.id,
      point_code: point.code || record.name || record.id,
      point_type: point.point_type || null,
      point_type_label: point.point_type_label || null,
      customer_party_id: point.customer_party_id || actionDetails.customer_party_id || null,
      customer_name: point.customer_name || actionDetails.customer_name || null,
      customer_location_id: point.customer_location_id || actionDetails.customer_location_id || null,
      customer_location_name: point.customer_location_name || actionDetails.customer_location_name || null,
      area: point.area || actionDetails.area || null,
      placement: point.placement || actionDetails.placement || null,
      severity: classification.severity,
      signals: classification.signals,
      repeat_streak: classification.repeat_streak,
      recommendation: classification.recommendation,
      due_hours: classification.due_hours,
      trigger_check_id: triggerCheckId,
      trigger_at: triggerAt,
      latest_check: latest,
      current_exception: Boolean(currentClassification),
      recent_checks: pointChecks.slice(0, 5),
      active_action: activeAction,
    });
  }

  rows.sort((a, b) => {
    const stateOrder = {
      needs_action: 0,
      completed_unverified: 1,
      failed: 2,
      ready: 3,
      check_required: 4,
      work_not_created: 5,
      work_in_progress: 6,
      verified: 7,
    };
    const aState = a.active_action?.verification?.state || "needs_action";
    const bState = b.active_action?.verification?.state || "needs_action";
    if ((stateOrder[aState] ?? 9) !== (stateOrder[bState] ?? 9)) return (stateOrder[aState] ?? 9) - (stateOrder[bState] ?? 9);
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return millis(b.trigger_at) - millis(a.trigger_at);
  });

  return {
    rows,
    resolved: resolved.sort((a, b) => millis(b.resolved_at) - millis(a.resolved_at)).slice(0, 100),
    metrics: {
      needs_action: rows.filter((row) => !row.active_action).length,
      ownership_required: rows.filter((row) => row.active_action && !["in_progress", "completed", "complete"].includes(normalized(row.active_action.status))).length,
      follow_up_ready: rows.filter((row) => normalized(row.active_action?.status) === "in_progress" && !row.active_action?.follow_up_work_order).length,
      work_open: rows.filter((row) => row.active_action?.follow_up_work_order && !COMPLETED_WORK_STATUSES.has(normalized(row.active_action.follow_up_work_order.status))).length,
      verification_required: rows.filter((row) => ["check_required", "failed", "completed_unverified"].includes(row.active_action?.verification?.state)).length,
      ready_to_close: rows.filter((row) => row.active_action?.verification?.can_verify).length,
      critical: rows.filter((row) => row.severity === "critical").length,
      repeat_patterns: rows.filter((row) => row.signals.includes("repeat_pattern")).length,
      resolved_recent: resolved.length,
    },
    authority: {
      evidence: "operations.activities",
      point_master: "operations.equipment",
      corrective_action: "operations.corrective-actions",
      follow_up_work: "operations.work-orders",
      rule: "A monitoring signal can create a governed corrective action. The action must enter accountable execution, any follow-up work must complete, and a newer governed monitoring check must clear the triggering condition before a human can verify corrective closure. Completed actions without verification remain visible and do not suppress the exception.",
    },
  };
}

export async function getMonitoringException({ context, pointId }) {
  const data = await getMonitoringExceptions({ context });
  return data.rows.find((row) => row.point_id === pointId) || null;
}

export default Object.freeze({ getMonitoringExceptions, getMonitoringException });
