import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";

const ACTIVE_STATUSES = ["OPEN", "ACTIVE"];

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function actorFromAccess(access) {
  return {
    user_id: access.user?.id || null,
    staff_id: access.access?.staffAccountId || access.staff?.id || null,
    staff_name:
      access.staff?.name ||
      access.staff?.display_name ||
      access.user?.email ||
      null,
  };
}

function normalizeSession(row) {
  if (!row) return null;

  const openingFloat = numeric(row.opening_cash);
  const cashTotal = numeric(row.cash_total);
  const status = String(row.status || "").toUpperCase();
  const expectedCash = ACTIVE_STATUSES.includes(status)
    ? openingFloat + cashTotal
    : numeric(row.expected_cash);
  const closingCount = numeric(row.closing_cash);
  const variance = numeric(
    row.variance ?? closingCount - expectedCash
  );

  return {
    ...row,
    session_id: row.id,
    opening_float: openingFloat,
    closing_count: closingCount,
    cash_total: cashTotal,
    card_total: numeric(row.card_total),
    qr_total: numeric(row.qr_total),
    transfer_total: numeric(row.transfer_total),
    net_sales: numeric(row.net_sales),
    expected_cash: expectedCash,
    variance,
    opened_at: row.opened_at || row.created_at || null,
    closed_at: row.closed_at || null,
  };
}

function requestEntityId(request) {
  try {
    const searchParams = new URL(request?.url || "http://localhost").searchParams;
    return (
      searchParams.get("entityId") ||
      searchParams.get("entity_id") ||
      searchParams.get("legalEntityId") ||
      searchParams.get("legal_entity_id") ||
      null
    );
  } catch {
    return null;
  }
}

function resolveScope({ body = {}, application, request }) {
  const entityId =
    body.entityId ||
    body.entity_id ||
    body.legalEntityId ||
    body.legal_entity_id ||
    requestEntityId(request) ||
    null;
  const applicationId = String(
    body.applicationId || body.application_id || application?.id || ""
  )
    .trim()
    .toLowerCase();

  if (!entityId) {
    const error = new Error("Select an active legal entity for cash control");
    error.status = 400;
    throw error;
  }
  if (!applicationId) {
    const error = new Error("POS application required for cash control");
    error.status = 400;
    throw error;
  }
  return { entityId, applicationId };
}

async function validateScope({ organizationId, entityId }) {
  const entity = await resolveEntity({ organizationId, entityId });
  if (!entity) {
    const error = new Error("Selected legal entity is outside the organization or inactive");
    error.status = 403;
    throw error;
  }
  return entity;
}

function rpcUnavailable(error, functionName) {
  return (
    error?.code === "PGRST202" ||
    String(error?.message || "").includes(functionName)
  );
}

function throwRpcError(error, functionName) {
  if (rpcUnavailable(error, functionName)) {
    const unavailable = new Error(
      "Atomic POS cash-session control is not deployed in the database"
    );
    unavailable.status = 503;
    throw unavailable;
  }

  throw error;
}

export async function loadCashSessions({
  access,
  application,
  organizationId,
  request,
}) {
  const scope = resolveScope({ application, request });
  await validateScope({ organizationId, entityId: scope.entityId });

  const result = await supabaseAdmin
    .from("pos_shifts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", scope.entityId)
    .eq("application_id", scope.applicationId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (result.error) throw result.error;

  const sessions = (result.data || []).map(normalizeSession);
  const activeSession =
    sessions.find((session) =>
      ACTIVE_STATUSES.includes(String(session.status || "").toUpperCase())
    ) || null;

  return {
    actor: actorFromAccess(access),
    organization_id: organizationId,
    entity_id: scope.entityId,
    application_id: scope.applicationId,
    sessions,
    active_session: activeSession,
    shifts: sessions,
    activeShift: activeSession,
  };
}

export async function executeCashSession({
  body,
  access,
  application,
  organizationId,
  request,
}) {
  const action = String(body.action || "").trim().toUpperCase();
  const actor = actorFromAccess(access);
  const scope = resolveScope({ body, application, request });
  await validateScope({ organizationId, entityId: scope.entityId });

  if (!actor.staff_id && !actor.user_id) {
    const error = new Error("Authenticated operator required");
    error.status = 403;
    throw error;
  }

  if (action === "OPEN") {
    const functionName = "pos_open_cash_session_atomic";
    const result = await supabaseAdmin.rpc(functionName, {
      p_organization_id: organizationId,
      p_entity_id: scope.entityId,
      p_application_id: scope.applicationId,
      p_staff_id: actor.staff_id || actor.user_id,
      p_staff_name: actor.staff_name || "Authenticated staff",
      p_opening_cash: numeric(
        body.openingFloat ??
          body.opening_float ??
          body.openingCash ??
          body.opening_cash
      ),
    });

    if (result.error) throwRpcError(result.error, functionName);

    const session = normalizeSession(result.data?.session || result.data);
    return {
      duplicate: Boolean(result.data?.duplicate),
      session,
      shift: session,
      ...scope,
    };
  }

  if (action === "CLOSE") {
    const sessionId =
      body.sessionId || body.session_id || body.shiftId || body.shift_id;

    if (!sessionId) {
      const error = new Error("sessionId required");
      error.status = 400;
      throw error;
    }

    const functionName = "pos_close_cash_session_atomic";
    const result = await supabaseAdmin.rpc(functionName, {
      p_organization_id: organizationId,
      p_entity_id: scope.entityId,
      p_application_id: scope.applicationId,
      p_session_id: sessionId,
      p_closing_cash: numeric(
        body.closingCount ??
          body.closing_count ??
          body.closingCash ??
          body.closing_cash
      ),
      p_closed_by: actor.staff_id || actor.user_id,
      p_closed_by_name: actor.staff_name || "Authenticated staff",
      p_notes:
        body.reconciliationNotes ||
        body.reconciliation_notes ||
        body.notes ||
        null,
    });

    if (result.error) throwRpcError(result.error, functionName);

    const session = normalizeSession(result.data?.session || result.data);
    return {
      duplicate: Boolean(result.data?.duplicate),
      session,
      shift: session,
      reconciliation: {
        expected_cash: session?.expected_cash || 0,
        closing_cash: session?.closing_count || 0,
        variance: session?.variance || 0,
        cash_total: session?.cash_total || 0,
        card_total: session?.card_total || 0,
        qr_total: session?.qr_total || 0,
        transfer_total: session?.transfer_total || 0,
        net_sales: session?.net_sales || 0,
      },
      ...scope,
    };
  }

  const error = new Error("Unsupported cash session action");
  error.status = 400;
  throw error;
}

const POSCashSessionAdapter = Object.freeze({
  load: loadCashSessions,
  execute: executeCashSession,
});

export default POSCashSessionAdapter;
