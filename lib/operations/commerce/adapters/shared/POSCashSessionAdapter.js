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
  return {
    ...row,
    session_id: row.id,
    opening_float: numeric(row.opening_cash),
    closing_count: numeric(row.closing_cash),
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
  const now = new Date().toISOString();

  if (!actor.staff_id && !actor.user_id) {
    const error = new Error("Authenticated operator required");
    error.status = 403;
    throw error;
  }

  if (action === "OPEN") {
    const existing = await supabaseAdmin
      .from("pos_shifts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("entity_id", scope.entityId)
      .eq("application_id", scope.applicationId)
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing.error && existing.error.code !== "PGRST116") {
      throw existing.error;
    }

    if (existing.data) {
      const session = normalizeSession(existing.data);
      return { duplicate: true, session, shift: session, ...scope };
    }

    const result = await supabaseAdmin
      .from("pos_shifts")
      .insert({
        organization_id: organizationId,
        entity_id: scope.entityId,
        application_id: scope.applicationId,
        staff_id: actor.staff_id || actor.user_id,
        staff_name: actor.staff_name || "Authenticated staff",
        opening_cash: numeric(
          body.openingFloat ??
            body.opening_float ??
            body.openingCash ??
            body.opening_cash
        ),
        status: "OPEN",
        opened_at: now,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (result.error) throw result.error;
    const session = normalizeSession(result.data);
    return { session, shift: session, ...scope };
  }

  if (action === "CLOSE") {
    const sessionId =
      body.sessionId || body.session_id || body.shiftId || body.shift_id;

    if (!sessionId) {
      const error = new Error("sessionId required");
      error.status = 400;
      throw error;
    }

    const result = await supabaseAdmin
      .from("pos_shifts")
      .update({
        closing_cash: numeric(
          body.closingCount ??
            body.closing_count ??
            body.closingCash ??
            body.closing_cash
        ),
        status: "CLOSED",
        closed_at: now,
        updated_at: now,
      })
      .eq("organization_id", organizationId)
      .eq("entity_id", scope.entityId)
      .eq("application_id", scope.applicationId)
      .eq("id", sessionId)
      .in("status", ACTIVE_STATUSES)
      .select("*")
      .maybeSingle();

    if (result.error) throw result.error;
    if (!result.data) {
      const error = new Error("Active cash session not found in selected scope");
      error.status = 404;
      throw error;
    }

    const session = normalizeSession(result.data);
    return { session, shift: session, ...scope };
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
