import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTIVE_CHECK_STATUSES = new Set(["recorded", "validated"]);
const TERMINAL_OCCURRENCE_STATUSES = new Set(["completed", "cancelled", "canceled", "archived"]);

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

function endOfUtcDay(value) {
  const date = dateValue(value) || new Date();
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999);
}

function addDays(value, days) {
  const date = dateValue(value);
  const amount = Number(days);
  if (!date || !Number.isFinite(amount) || amount < 1) return null;
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString();
}

function dayState(value, referenceAt) {
  const due = dateValue(value);
  if (!due) return "unset";
  const reference = dateValue(referenceAt) || new Date();
  const referenceDay = Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate());
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  if (dueDay < referenceDay) return "overdue";
  if (dueDay === referenceDay) return "due_today";
  return "upcoming";
}

function monitoringPoint(record = {}) {
  return record.attributes?.monitoring_point || null;
}

function monitoringCheck(record = {}) {
  return record.attributes?.monitoring_point_check || null;
}

function requireContext(context = {}) {
  if (!context.organization_id) {
    const error = new Error("Service monitoring requires organization_id.");
    error.status = 400;
    throw error;
  }
  return context;
}

async function loadOccurrence({ organizationId, occurrenceId }) {
  const result = await supabaseAdmin
    .from("service_plan_occurrences")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", occurrenceId)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) {
    const error = new Error("Service occurrence not found.");
    error.status = 404;
    throw error;
  }
  return result.data;
}

function deliveryFor(occurrence = {}) {
  return occurrence.attributes?.service_delivery || {};
}

async function loadSitePoints({ organizationId, entityId, customerLocationId }) {
  let query = supabaseAdmin
    .from("operations_records")
    .select("id,status,name,entity_id,created_at,updated_at,attributes")
    .eq("organization_id", organizationId)
    .eq("capability_id", "equipment")
    .limit(5000);

  if (entityId) query = query.or(`entity_id.eq.${entityId},entity_id.is.null`);

  const result = await query;
  if (result.error) throw result.error;
  return (result.data || []).filter((record) => {
    const point = monitoringPoint(record);
    return point?.industry_key === "pest-control"
      && normalized(record.status) === "active"
      && text(point.customer_location_id, 160) === customerLocationId;
  });
}

async function loadChecks({ organizationId, entityId, pointIds }) {
  if (!pointIds.length) return [];
  let query = supabaseAdmin
    .from("operations_records")
    .select("id,status,source_id,entity_id,created_at,attributes")
    .eq("organization_id", organizationId)
    .eq("capability_id", "activities")
    .eq("source_domain", "service-management")
    .eq("source_type", "monitoring-point-check")
    .in("source_id", pointIds)
    .in("status", [...ACTIVE_CHECK_STATUSES])
    .order("created_at", { ascending: false })
    .limit(10000);

  if (entityId) query = query.or(`entity_id.eq.${entityId},entity_id.is.null`);

  const result = await query;
  if (result.error) throw result.error;
  return result.data || [];
}

function projectPoint({ record, checks, occurrence, referenceAt }) {
  const point = monitoringPoint(record) || {};
  const installedAt = point.installed_at || record.created_at || null;
  const referenceEnd = endOfUtcDay(referenceAt);
  const historicalChecks = checks
    .map((row) => ({ id: row.id, status: row.status, created_at: row.created_at, ...monitoringCheck(row) }))
    .filter((row) => millis(row.checked_at || row.created_at) <= referenceEnd)
    .sort((a, b) => millis(b.checked_at || b.created_at) - millis(a.checked_at || a.created_at));
  const latestBeforeVisit = historicalChecks.find((row) => row.occurrence_id !== occurrence.id) || null;
  const visitChecks = historicalChecks.filter((row) => row.occurrence_id === occurrence.id);
  const latestVisitCheck = visitChecks[0] || null;
  const cadenceAnchor = latestBeforeVisit?.checked_at || installedAt;
  const nextCheckAt = addDays(cadenceAnchor, point.check_cadence_days);
  const dueState = latestBeforeVisit ? dayState(nextCheckAt, referenceAt) : "never_checked";
  const installedForVisit = !installedAt || millis(installedAt) <= referenceEnd;
  const requiredForVisit = installedForVisit && ["never_checked", "overdue", "due_today"].includes(dueState);
  const checkedInVisit = visitChecks.length > 0;
  const latest = latestVisitCheck || latestBeforeVisit;
  const attentionCondition = ["damaged", "missing", "blocked", "contaminated", "replacement_required"].includes(normalized(latest?.condition));
  const attentionActivity = ["high", "critical"].includes(normalized(latest?.activity_level));

  return {
    id: record.id,
    code: point.code || record.name || record.id,
    barcode: point.barcode || null,
    point_type: point.point_type || null,
    point_type_label: point.point_type_label || null,
    area: point.area || null,
    placement: point.placement || null,
    customer_location_id: point.customer_location_id || null,
    customer_location_name: point.customer_location_name || null,
    check_cadence_days: point.check_cadence_days || null,
    installed_at: installedAt,
    next_check_at: nextCheckAt,
    due_state: dueState,
    required_for_visit: requiredForVisit,
    checked_in_visit: checkedInVisit,
    pending_required: requiredForVisit && !checkedInVisit,
    visit_check_count: visitChecks.length,
    latest_check: latest || null,
    latest_visit_check: latestVisitCheck,
    needs_attention: Boolean(attentionCondition || attentionActivity),
  };
}

export async function getServiceMonitoringRound({ context, occurrenceId }) {
  const runtimeContext = requireContext(context);
  const occurrence = await loadOccurrence({
    organizationId: runtimeContext.organization_id,
    occurrenceId,
  });
  if (
    runtimeContext.entity_id
    && occurrence.entity_id
    && occurrence.entity_id !== runtimeContext.entity_id
  ) {
    const error = new Error("Service occurrence is outside the active entity context.");
    error.status = 403;
    throw error;
  }

  const delivery = deliveryFor(occurrence);
  const customerLocationId = text(delivery.customer_location_id, 160);
  const referenceAt = occurrence.occurrence_at || occurrence.original_scheduled_start || new Date().toISOString();
  if (!customerLocationId || normalized(delivery.industry_key) !== "pest_control") {
    return {
      occurrence_id: occurrence.id,
      work_order_id: occurrence.work_order_id || null,
      service_plan_id: occurrence.service_plan_id || null,
      customer_location_id: customerLocationId || null,
      customer_location_name: text(delivery.customer_location_name, 220) || null,
      applicable: false,
      completion_ready: true,
      active_points: 0,
      required_points: 0,
      checked_required_points: 0,
      pending_required_points: 0,
      checked_points: 0,
      points: [],
    };
  }

  const records = await loadSitePoints({
    organizationId: runtimeContext.organization_id,
    entityId: occurrence.entity_id || runtimeContext.entity_id || null,
    customerLocationId,
  });
  const pointIds = records.map((record) => record.id);
  const checks = await loadChecks({
    organizationId: runtimeContext.organization_id,
    entityId: occurrence.entity_id || runtimeContext.entity_id || null,
    pointIds,
  });
  const checksByPoint = new Map();
  for (const row of checks) {
    const bucket = checksByPoint.get(row.source_id) || [];
    bucket.push(row);
    checksByPoint.set(row.source_id, bucket);
  }

  const points = records
    .map((record) => projectPoint({
      record,
      checks: checksByPoint.get(record.id) || [],
      occurrence,
      referenceAt,
    }))
    .filter((point) => !point.installed_at || millis(point.installed_at) <= endOfUtcDay(referenceAt))
    .sort((a, b) => {
      if (a.pending_required !== b.pending_required) return a.pending_required ? -1 : 1;
      if (a.required_for_visit !== b.required_for_visit) return a.required_for_visit ? -1 : 1;
      if (a.needs_attention !== b.needs_attention) return a.needs_attention ? -1 : 1;
      return String(a.code || "").localeCompare(String(b.code || ""));
    });
  const requiredPoints = points.filter((point) => point.required_for_visit);
  const checkedRequiredPoints = requiredPoints.filter((point) => point.checked_in_visit);
  const checkedPoints = points.filter((point) => point.checked_in_visit);
  const pending = requiredPoints.filter((point) => !point.checked_in_visit);

  return {
    occurrence_id: occurrence.id,
    occurrence_status: occurrence.status,
    work_order_id: occurrence.work_order_id || null,
    service_plan_id: occurrence.service_plan_id || null,
    customer_party_id: text(delivery.customer_party_id, 160) || null,
    customer_name: text(delivery.customer_name, 220) || null,
    customer_location_id: customerLocationId,
    customer_location_name: text(delivery.customer_location_name, 220) || null,
    reference_at: referenceAt,
    applicable: true,
    active_points: points.length,
    required_points: requiredPoints.length,
    checked_required_points: checkedRequiredPoints.length,
    pending_required_points: pending.length,
    checked_points: checkedPoints.length,
    completion_ready: pending.length === 0,
    pending_codes: pending.map((point) => point.code).slice(0, 20),
    points,
    authority: {
      master: "operations.equipment",
      check_evidence: "operations.activities",
      visit: "service_plan_occurrences",
      rule: "Only active points due, overdue or never checked as of the service date are completion-required; upcoming points stay visible but non-blocking.",
    },
  };
}

export async function assertMonitoringPointVisitBinding({ context, occurrenceId, point }) {
  const runtimeContext = requireContext(context);
  if (!occurrenceId) return null;
  const occurrence = await loadOccurrence({
    organizationId: runtimeContext.organization_id,
    occurrenceId,
  });
  if (TERMINAL_OCCURRENCE_STATUSES.has(normalized(occurrence.status))) {
    const error = new Error("Monitoring checks cannot be attached to a terminal service occurrence.");
    error.status = 409;
    throw error;
  }
  if (
    runtimeContext.entity_id
    && occurrence.entity_id
    && occurrence.entity_id !== runtimeContext.entity_id
  ) {
    const error = new Error("Service occurrence is outside the active entity context.");
    error.status = 403;
    throw error;
  }
  const delivery = deliveryFor(occurrence);
  const occurrenceLocationId = text(delivery.customer_location_id, 160);
  if (!occurrenceLocationId || occurrenceLocationId !== text(point?.customer_location_id, 160)) {
    const error = new Error("This monitoring point belongs to a different customer site than the active service visit.");
    error.status = 409;
    throw error;
  }
  return {
    occurrence_id: occurrence.id,
    work_order_id: occurrence.work_order_id || null,
    service_plan_id: occurrence.service_plan_id || null,
    customer_party_id: text(delivery.customer_party_id, 160) || null,
    customer_location_id: occurrenceLocationId,
  };
}

export async function assertServiceMonitoringComplete({ context, occurrenceId }) {
  const round = await getServiceMonitoringRound({ context, occurrenceId });
  if (!round.applicable || round.completion_ready) return round;
  const codes = round.pending_codes.slice(0, 8);
  const remaining = round.pending_required_points - codes.length;
  const error = new Error(
    `Monitoring coverage is incomplete. Check required point${round.pending_required_points === 1 ? "" : "s"}: ${codes.join(", ")}${remaining > 0 ? ` and ${remaining} more` : ""}.`,
  );
  error.status = 409;
  error.monitoring_round = round;
  throw error;
}

export default Object.freeze({
  getServiceMonitoringRound,
  assertMonitoringPointVisitBinding,
  assertServiceMonitoringComplete,
});
