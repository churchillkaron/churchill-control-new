export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import { resolveOperationsRequestContext, searchParamsToObject } from "@/lib/operations/api/resolveOperationsRequestContext";
import { authorizeOperationsAccess, OPERATIONS_ACTIONS } from "@/lib/operations/security/OperationsAuthorizationPolicy";

const ACTIVE_CHECK_STATUSES = new Set(["recorded", "validated"]);

function text(value, max = 500) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, max) : "";
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function comparable(value) {
  return text(value, 500).toLocaleLowerCase();
}

function dateValue(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function addDays(value, days) {
  const date = dateValue(value);
  const amount = Number(days);
  if (!date || !Number.isFinite(amount) || amount < 1) return null;
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString();
}

function dueState(value, status) {
  if (normalized(status) !== "active") return "inactive";
  const due = dateValue(value);
  if (!due) return "unset";
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  if (dueDay < today) return "overdue";
  if (dueDay === today) return "due_today";
  return "upcoming";
}

function responseError(error, status = 500, extra = {}) {
  return Response.json(
    { success: false, error: error?.message || error || "Monitoring point lookup failed.", ...extra },
    { status: error?.status || status },
  );
}

function requirePermission(context, capabilityId) {
  const authorization = authorizeOperationsAccess({
    permissions: context.permissions || [],
    capabilityId,
    action: OPERATIONS_ACTIONS.VIEW,
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

function lookupCandidates(rawValue) {
  const raw = text(rawValue, 500);
  if (!raw) return [];
  const candidates = new Set([raw]);

  try {
    const url = new URL(raw);
    for (const key of ["point", "code", "barcode", "monitoringPoint", "monitoring_point"]) {
      const value = text(url.searchParams.get(key), 500);
      if (value) candidates.add(value);
    }
    const segments = url.pathname.split("/").filter(Boolean);
    const last = text(segments.at(-1), 500);
    if (last && !["scan", "monitoring-points"].includes(last)) candidates.add(decodeURIComponent(last));
  } catch {
    // Plain barcode / QR payloads are expected and need no URL parsing.
  }

  return [...candidates];
}

function monitoringPoint(record = {}) {
  return record.attributes?.monitoring_point || null;
}

function monitoringCheck(record = {}) {
  return record.attributes?.monitoring_point_check || null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const input = searchParamsToObject(searchParams);
    const resolved = await resolveOperationsRequestContext({ request, input, authorize: false });
    if (!resolved.success) return responseError(resolved.error, resolved.status || 403);

    const context = resolved.context;
    requirePermission(context, "equipment");
    requirePermission(context, "activities");

    const candidates = lookupCandidates(input.lookup || input.code || input.barcode);
    if (!candidates.length) return responseError("Scan or enter a monitoring point code or barcode.", 400);
    const candidateSet = new Set(candidates.map(comparable));

    const equipmentBody = requireOperationsResult(
      await serverOperationsApi.list({ capabilityId: "equipment", context }),
      "Unable to search operational equipment.",
    );

    const matches = (equipmentBody.rows || []).filter((record) => {
      const point = monitoringPoint(record);
      if (point?.industry_key !== "pest-control") return false;
      return candidateSet.has(comparable(point.code)) || candidateSet.has(comparable(point.barcode));
    });

    if (!matches.length) return responseError("No Pest Control monitoring point matches this code or barcode.", 404);
    if (matches.length > 1) return responseError("This scan resolves to more than one monitoring point. Correct duplicate identities before field use.", 409);

    const record = matches[0];
    const point = monitoringPoint(record);
    const activitiesBody = requireOperationsResult(
      await serverOperationsApi.list({
        capabilityId: "activities",
        context,
        filters: {
          source_domain: "service-management",
          source_type: "monitoring-point-check",
          source_id: record.id,
        },
      }),
      "Unable to load monitoring point history.",
    );

    const checks = (activitiesBody.rows || [])
      .filter((row) => ACTIVE_CHECK_STATUSES.has(normalized(row.status)))
      .map((row) => ({
        id: row.id,
        status: row.status,
        created_at: row.created_at,
        ...monitoringCheck(row),
      }))
      .filter((row) => row.monitoring_point_id === record.id)
      .sort((a, b) => (dateValue(b.checked_at || b.created_at)?.getTime() || 0) - (dateValue(a.checked_at || a.created_at)?.getTime() || 0));

    const latest = checks[0] || null;
    const cadenceAnchor = latest?.checked_at || point.installed_at || record.created_at || null;
    const nextCheckAt = addDays(cadenceAnchor, point.check_cadence_days);
    const state = dueState(nextCheckAt, record.status);

    return Response.json({
      success: true,
      matched_by: candidates.find((candidate) => comparable(candidate) === comparable(point.barcode)) ? "barcode" : "code",
      point: {
        id: record.id,
        status: record.status,
        allowed_commands: record.allowed_commands || [],
        name: record.name,
        ...point,
        check_count: checks.length,
        latest_check: latest,
        checks: checks.slice(0, 20),
        next_check_at: nextCheckAt,
        due_state: state,
        needs_attention:
          ["overdue", "due_today"].includes(state)
          || ["high", "critical"].includes(normalized(latest?.activity_level))
          || ["damaged", "missing", "blocked", "contaminated", "replacement_required"].includes(normalized(latest?.condition)),
      },
      authority: {
        master: "operations.equipment",
        history: "operations.activities",
        note: "Lookup resolves the governed Operations equipment identity; it never creates or mutates a parallel Pest Control device master.",
      },
    });
  } catch (error) {
    return responseError(error, 500, { required_permissions: error?.required_permissions || [] });
  }
}
