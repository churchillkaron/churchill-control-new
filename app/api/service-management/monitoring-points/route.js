export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import { resolveOperationsRequestContext, searchParamsToObject } from "@/lib/operations/api/resolveOperationsRequestContext";
import { authorizeOperationsAccess, OPERATIONS_ACTIONS } from "@/lib/operations/security/OperationsAuthorizationPolicy";
import { getServicePlans } from "@/lib/service-management/runtime/ServicePlanRuntime";

const POINT_TYPES = new Set([
  "rodent_bait_station",
  "rodent_trap",
  "glue_board",
  "insect_light_trap",
  "termite_station",
  "monitoring_trap",
  "other",
]);
const CONDITIONS = new Set(["good", "damaged", "missing", "blocked", "contaminated", "replacement_required"]);
const ACTIVITY_LEVELS = new Set(["none", "low", "medium", "high", "critical"]);
const ACTIONS = new Set(["inspected", "cleaned", "rebaited", "reset", "repaired", "replaced", "removed"]);
const ACTIVE_ACTIVITY_STATUSES = new Set(["recorded", "validated"]);

function text(value, max = 500) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, max) : "";
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function boundedNumber(value, min, max, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return fallback;
  return number;
}

function dateValue(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function addDays(value, days) {
  const date = dateValue(value);
  if (!date || !Number.isFinite(Number(days))) return null;
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString();
}

function dayState(value) {
  const due = dateValue(value);
  if (!due) return "unset";
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  if (dueDay < today) return "overdue";
  if (dueDay === today) return "due_today";
  return "upcoming";
}

function monitoringPoint(record = {}) {
  return record.attributes?.monitoring_point || null;
}

function monitoringCheck(record = {}) {
  return record.attributes?.monitoring_point_check || null;
}

function responseError(error, status = 500, extra = {}) {
  return Response.json(
    { success: false, error: error?.message || error || "Monitoring point request failed.", ...extra },
    { status: error?.status || status },
  );
}

function requirePermission(context, { capabilityId, action = OPERATIONS_ACTIONS.VIEW, command = null }) {
  const authorization = authorizeOperationsAccess({
    permissions: context.permissions || [],
    capabilityId,
    action,
    command,
  });
  if (authorization.allowed) return authorization;
  const error = new Error("Operations permission required");
  error.status = 403;
  error.required_permissions = authorization.required_permissions;
  throw error;
}

function requireOperationsResult(result, fallback) {
  if (result?.status < 400 && result?.body?.ok) return result.body;
  const error = new Error(result?.body?.error || fallback);
  error.status = result?.status || 500;
  throw error;
}

async function loadSites(context) {
  const plans = await getServicePlans({ context, filters: { limit: 1000 } });
  const byLocation = new Map();
  for (const plan of plans) {
    const locationId = text(plan.customer_location_id, 160);
    if (!locationId) continue;
    const delivery = plan.attributes?.service_delivery || {};
    if (!byLocation.has(locationId)) {
      byLocation.set(locationId, {
        customer_location_id: locationId,
        customer_location_name: text(plan.customer_location_name, 220) || "Site",
        customer_party_id: text(plan.customer_party_id, 160) || null,
        customer_name: text(delivery.customer_name, 220) || "Customer",
      });
    }
  }
  return [...byLocation.values()].sort((a, b) => `${a.customer_name} ${a.customer_location_name}`.localeCompare(`${b.customer_name} ${b.customer_location_name}`));
}

async function loadMonitoringData(context) {
  requirePermission(context, { capabilityId: "equipment", action: OPERATIONS_ACTIONS.VIEW });
  requirePermission(context, { capabilityId: "activities", action: OPERATIONS_ACTIONS.VIEW });

  const [equipmentResult, activitiesResult, sites] = await Promise.all([
    serverOperationsApi.list({ capabilityId: "equipment", context }),
    serverOperationsApi.list({
      capabilityId: "activities",
      context,
      filters: { source_domain: "service-management", source_type: "monitoring-point-check" },
    }),
    loadSites(context),
  ]);

  const equipmentBody = requireOperationsResult(equipmentResult, "Unable to load operational equipment.");
  const activitiesBody = requireOperationsResult(activitiesResult, "Unable to load monitoring point checks.");
  const points = (equipmentBody.rows || []).filter((row) => monitoringPoint(row)?.industry_key === "pest-control");
  const pointIds = new Set(points.map((row) => row.id));
  const checksByPoint = new Map();

  for (const row of activitiesBody.rows || []) {
    if (!pointIds.has(row.source_id)) continue;
    if (!ACTIVE_ACTIVITY_STATUSES.has(normalized(row.status))) continue;
    const check = monitoringCheck(row);
    if (!check) continue;
    const bucket = checksByPoint.get(row.source_id) || [];
    bucket.push({ id: row.id, status: row.status, created_at: row.created_at, ...check });
    checksByPoint.set(row.source_id, bucket);
  }

  const now = Date.now();
  const rows = points.map((record) => {
    const point = monitoringPoint(record);
    const checks = (checksByPoint.get(record.id) || []).sort((a, b) => new Date(b.checked_at || b.created_at || 0) - new Date(a.checked_at || a.created_at || 0));
    const latest = checks[0] || null;
    const cadenceDays = boundedNumber(point.check_cadence_days, 1, 3650, null);
    const cadenceAnchor = latest?.checked_at || point.installed_at || record.created_at || null;
    const nextCheckAt = cadenceDays ? addDays(cadenceAnchor, cadenceDays) : null;
    const dueState = normalized(record.status) === "active" ? dayState(nextCheckAt) : "inactive";
    const attentionCondition = latest && ["damaged", "missing", "blocked", "contaminated", "replacement_required"].includes(normalized(latest.condition));
    const attentionActivity = latest && ["high", "critical"].includes(normalized(latest.activity_level));
    return {
      id: record.id,
      status: record.status,
      allowed_commands: record.allowed_commands || [],
      name: record.name,
      created_at: record.created_at,
      updated_at: record.updated_at,
      ...point,
      check_count: checks.length,
      latest_check: latest,
      checks: checks.slice(0, 50),
      next_check_at: nextCheckAt,
      due_state: dueState,
      needs_attention: dueState === "overdue" || dueState === "due_today" || Boolean(attentionCondition || attentionActivity),
      days_since_check: latest?.checked_at ? Math.max(0, Math.floor((now - new Date(latest.checked_at).getTime()) / 86400000)) : null,
    };
  }).sort((a, b) => {
    if (a.needs_attention !== b.needs_attention) return a.needs_attention ? -1 : 1;
    const order = { overdue: 0, due_today: 1, upcoming: 2, unset: 3, inactive: 4 };
    if ((order[a.due_state] ?? 9) !== (order[b.due_state] ?? 9)) return (order[a.due_state] ?? 9) - (order[b.due_state] ?? 9);
    return String(a.code || "").localeCompare(String(b.code || ""));
  });

  return {
    rows,
    sites,
    metrics: {
      active: rows.filter((row) => normalized(row.status) === "active").length,
      due_today: rows.filter((row) => row.due_state === "due_today").length,
      overdue: rows.filter((row) => row.due_state === "overdue").length,
      activity_alerts: rows.filter((row) => ["high", "critical"].includes(normalized(row.latest_check?.activity_level))).length,
      condition_alerts: rows.filter((row) => ["damaged", "missing", "blocked", "contaminated", "replacement_required"].includes(normalized(row.latest_check?.condition))).length,
      unchecked: rows.filter((row) => !row.latest_check).length,
    },
  };
}

function typeLabel(value) {
  return ({
    rodent_bait_station: "Rodent bait station",
    rodent_trap: "Rodent trap",
    glue_board: "Glue board",
    insect_light_trap: "Insect light trap",
    termite_station: "Termite station",
    monitoring_trap: "Monitoring trap",
    other: "Monitoring point",
  })[value] || "Monitoring point";
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const input = searchParamsToObject(searchParams);
    const resolved = await resolveOperationsRequestContext({ request, input, authorize: false });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const data = await loadMonitoringData(resolved.context);
    return Response.json({
      success: true,
      ...data,
      authority: {
        master: "operations.equipment",
        history: "operations.activities",
        site: "service-plans.customer_location_id",
        inventory: "supply-chain",
        note: "Monitoring points reuse canonical Operations equipment. Checks are append-only operational activity evidence; customer sites and inventory remain owned by their source domains.",
      },
    });
  } catch (error) {
    return responseError(error, 500, { required_permissions: error?.required_permissions || [] });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = await resolveOperationsRequestContext({ request, input: body, authorize: false });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);
    const context = resolved.context;
    const action = normalized(body.action || "create");

    if (action === "create") {
      requirePermission(context, { capabilityId: "equipment", command: "create" });
      requirePermission(context, { capabilityId: "equipment", command: "activate" });
      const code = text(body.code, 80).toUpperCase();
      const barcode = text(body.barcode, 120);
      const pointType = normalized(body.pointType || body.point_type);
      const locationId = text(body.customerLocationId || body.customer_location_id, 160);
      const cadenceDays = boundedNumber(body.checkCadenceDays || body.check_cadence_days, 1, 3650, null);
      if (!code) return responseError("Monitoring point code is required.", 400);
      if (!POINT_TYPES.has(pointType)) return responseError("Choose a supported monitoring point type.", 400);
      if (!locationId) return responseError("Choose the exact customer site for this monitoring point.", 400);
      if (!cadenceDays) return responseError("Check cadence must be between 1 and 3650 days.", 400);

      const current = await loadMonitoringData(context);
      const duplicateCode = current.rows.some((row) => normalized(row.code) === normalized(code));
      const duplicateBarcode = barcode && current.rows.some((row) => normalized(row.barcode) === normalized(barcode));
      if (duplicateCode) return responseError(`Monitoring point code ${code} already exists.`, 409);
      if (duplicateBarcode) return responseError(`Barcode ${barcode} is already assigned to another monitoring point.`, 409);
      const site = current.sites.find((row) => row.customer_location_id === locationId);
      if (!site) return responseError("The selected customer site is not present in governed service plans for this organization.", 409);

      const installedAt = dateValue(body.installedAt || body.installed_at)?.toISOString() || new Date().toISOString();
      const point = {
        schema_version: 1,
        industry_key: "pest-control",
        code,
        barcode: barcode || null,
        point_type: pointType,
        point_type_label: typeLabel(pointType),
        customer_party_id: site.customer_party_id,
        customer_name: site.customer_name,
        customer_location_id: site.customer_location_id,
        customer_location_name: site.customer_location_name,
        area: text(body.area, 160) || null,
        placement: text(body.placement, 300) || null,
        installed_at: installedAt,
        check_cadence_days: cadenceDays,
      };

      const createResult = await serverOperationsApi.execute({
        capabilityId: "equipment",
        command: "create",
        context,
        payload: {
          name: `${code} — ${typeLabel(pointType)}`,
          description: [site.customer_name, site.customer_location_name, point.area].filter(Boolean).join(" · "),
          source_domain: "service-management",
          source_type: "customer-location",
          source_id: site.customer_location_id,
          idempotency_key: text(body.clientMutationId || body.client_mutation_id, 160) || `monitoring-point:${code}`,
          attributes: { monitoring_point: point },
        },
      });
      const created = requireOperationsResult(createResult, "Unable to create monitoring point.").execution?.result;
      if (!created?.id) return responseError("Monitoring point creation returned no equipment record.", 500);

      const activateResult = await serverOperationsApi.execute({
        capabilityId: "equipment",
        command: "activate",
        context,
        payload: {
          id: created.id,
          idempotency_key: `monitoring-point:${created.id}:activate`,
        },
      });
      const activated = requireOperationsResult(activateResult, "Monitoring point was created but could not be activated.").execution?.result || created;
      return Response.json({ success: true, action, row: activated }, { status: 201 });
    }

    if (action === "check") {
      requirePermission(context, { capabilityId: "equipment", action: OPERATIONS_ACTIONS.VIEW });
      requirePermission(context, { capabilityId: "activities", command: "record" });
      const pointId = text(body.pointId || body.point_id, 160);
      if (!pointId) return responseError("Monitoring point id is required.", 400);
      const detailResult = await serverOperationsApi.detail({ capabilityId: "equipment", id: pointId, context });
      const record = requireOperationsResult(detailResult, "Monitoring point not found.").record;
      const point = monitoringPoint(record);
      if (!point || point.industry_key !== "pest-control") return responseError("This equipment record is not a Pest Control monitoring point.", 409);
      if (normalized(record.status) !== "active") return responseError("Only active monitoring points can receive new checks.", 409);

      const condition = normalized(body.condition || "good");
      const activityLevel = normalized(body.activityLevel || body.activity_level || "none");
      const actionTaken = normalized(body.actionTaken || body.action_taken || "inspected");
      if (!CONDITIONS.has(condition)) return responseError("Unsupported monitoring point condition.", 400);
      if (!ACTIVITY_LEVELS.has(activityLevel)) return responseError("Unsupported pest activity level.", 400);
      if (!ACTIONS.has(actionTaken)) return responseError("Unsupported monitoring point service action.", 400);
      const checkedAt = dateValue(body.checkedAt || body.checked_at)?.toISOString() || new Date().toISOString();
      const count = boundedNumber(body.count, 0, 100000, 0);
      const check = {
        schema_version: 1,
        monitoring_point_id: record.id,
        monitoring_point_code: point.code,
        customer_party_id: point.customer_party_id,
        customer_location_id: point.customer_location_id,
        customer_location_name: point.customer_location_name,
        checked_at: checkedAt,
        condition,
        activity_level: activityLevel,
        pest_name: text(body.pestName || body.pest_name, 120) || null,
        count,
        action_taken: actionTaken,
        notes: text(body.notes, 1200) || null,
        technician_id: context.actor_id || null,
      };
      const mutationId = text(body.clientMutationId || body.client_mutation_id, 160) || `${Date.now()}`;
      const recordResult = await serverOperationsApi.execute({
        capabilityId: "activities",
        command: "record",
        context,
        payload: {
          name: `${point.code} monitoring check`,
          description: `${condition} · ${activityLevel} activity · ${actionTaken}`,
          source_domain: "service-management",
          source_type: "monitoring-point-check",
          source_id: record.id,
          idempotency_key: `monitoring-check:${record.id}:${mutationId}`,
          attributes: { monitoring_point_check: check },
        },
      });
      const activity = requireOperationsResult(recordResult, "Unable to record monitoring point check.").execution?.result;
      return Response.json({ success: true, action, activity });
    }

    if (action === "transition") {
      const pointId = text(body.pointId || body.point_id, 160);
      const command = normalized(body.command);
      if (!pointId) return responseError("Monitoring point id is required.", 400);
      if (!["activate", "deactivate", "archive"].includes(command)) return responseError("Unsupported monitoring point lifecycle command.", 400);
      requirePermission(context, { capabilityId: "equipment", command });
      const result = await serverOperationsApi.execute({
        capabilityId: "equipment",
        command,
        context,
        payload: {
          id: pointId,
          idempotency_key: text(body.clientMutationId || body.client_mutation_id, 160) || `monitoring-point:${pointId}:${command}:${Date.now()}`,
        },
      });
      const row = requireOperationsResult(result, "Unable to change monitoring point lifecycle.").execution?.result;
      return Response.json({ success: true, action, row });
    }

    return responseError("Unsupported monitoring point action.", 400);
  } catch (error) {
    return responseError(error, 500, { required_permissions: error?.required_permissions || [] });
  }
}
