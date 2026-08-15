import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { runEventProcessors } from "@/lib/workers/system/runEventProcessors";

const MOVEMENT_ROLES = new Set([
  "MANAGER",
  "GENERAL_MANAGER",
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

const MOVEMENT_TYPES = new Set([
  "PAID_IN",
  "PAID_OUT",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
]);

function normalizedRole(access = {}) {
  return String(
    access.role ||
      access.access?.role ||
      access.membership?.role ||
      access.staff?.role ||
      ""
  )
    .trim()
    .toUpperCase();
}

function actorFromAccess(access = {}) {
  const role = normalizedRole(access);
  return {
    user_id: access.user?.id || null,
    staff_id: access.access?.staffAccountId || access.staff?.id || null,
    staff_name:
      access.staff?.name ||
      access.staff?.display_name ||
      access.user?.email ||
      null,
    role: role || null,
    can_move_cash: MOVEMENT_ROLES.has(role),
  };
}

function requestValue(request, keys) {
  try {
    const params = new URL(request?.url || "http://localhost").searchParams;
    for (const key of keys) {
      const value = params.get(key);
      if (value) return value;
    }
  } catch {}
  return null;
}

function resolveScope({ body = {}, application, request }) {
  const entityId =
    body.entityId ||
    body.entity_id ||
    body.legalEntityId ||
    body.legal_entity_id ||
    requestValue(request, [
      "entityId",
      "entity_id",
      "legalEntityId",
      "legal_entity_id",
    ]) ||
    null;

  const applicationId = String(
    body.applicationId ||
      body.application_id ||
      application?.id ||
      requestValue(request, ["applicationId", "application_id"]) ||
      ""
  )
    .trim()
    .toLowerCase();

  if (!entityId) {
    const error = new Error("Select an active legal entity for cash movements");
    error.status = 400;
    throw error;
  }
  if (!applicationId) {
    const error = new Error("POS application required for cash movements");
    error.status = 400;
    throw error;
  }
  return { entityId, applicationId };
}

async function validateScope({ organizationId, entityId }) {
  const entity = await resolveEntity({ organizationId, entityId });
  if (!entity) {
    const error = new Error(
      "Selected legal entity is outside the organization or inactive"
    );
    error.status = 403;
    throw error;
  }
  return entity;
}

async function dispatchMovementEvent({ organizationId, eventId }) {
  if (!eventId) return { pending: false, error: null };
  try {
    const dispatch = await runEventProcessors({
      organizationId,
      eventId,
      limit: 1,
    });
    const pending =
      dispatch?.success === false ||
      Number(dispatch?.failed || 0) > 0 ||
      Boolean(dispatch?.failures?.length);
    return {
      pending,
      error: pending
        ? dispatch?.failures?.[0]?.error ||
          dispatch?.error ||
          "POS cash movement event dispatch incomplete"
        : null,
    };
  } catch (error) {
    return {
      pending: true,
      error: error?.message || "POS cash movement event dispatch failed",
    };
  }
}

async function resolveCashAccountId({ organizationId, entityId }) {
  const result = await supabaseAdmin
    .from("finance_posting_mappings")
    .select("debit_account_id")
    .eq("organization_id", organizationId)
    .eq("event_type", "POS_CASH_PAYMENT_RECEIVED")
    .eq("status", "ACTIVE")
    .or(`entity_id.eq.${entityId},entity_id.is.null`)
    .order("entity_id", { ascending: false, nullsFirst: false })
    .order("priority", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (result.error && result.error.code !== "PGRST116") throw result.error;
  return result.data?.debit_account_id || null;
}

export async function loadCashMovements({
  access,
  application,
  organizationId,
  request,
}) {
  const actor = actorFromAccess(access);
  const scope = resolveScope({ application, request });
  await validateScope({ organizationId, entityId: scope.entityId });

  const cashAccountId = await resolveCashAccountId({
    organizationId,
    entityId: scope.entityId,
  });

  const [shiftResult, movementResult, accountResult] = await Promise.all([
    supabaseAdmin
      .from("pos_shifts")
      .select(
        "id, opening_cash, cash_total, refund_total, reversal_total, paid_in_total, paid_out_total, adjustment_in_total, adjustment_out_total, expected_cash, status, locked, opened_at, created_at"
      )
      .eq("organization_id", organizationId)
      .eq("entity_id", scope.entityId)
      .eq("application_id", scope.applicationId)
      .in("status", ["OPEN", "ACTIVE"])
      .eq("locked", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("pos_cash_movements")
      .select(
        "id, cash_session_id, movement_type, amount, currency_code, cash_account_id, counter_account_id, journal_entry_id, reason, status, created_by, created_at"
      )
      .eq("organization_id", organizationId)
      .eq("entity_id", scope.entityId)
      .eq("application_id", scope.applicationId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("chart_of_accounts")
      .select(
        "id, account_code, account_name, account_category, account_type, normal_balance, currency_code"
      )
      .eq("organization_id", organizationId)
      .eq("entity_id", scope.entityId)
      .eq("is_active", true)
      .order("account_code", { ascending: true }),
  ]);

  if (shiftResult.error && shiftResult.error.code !== "PGRST116") {
    throw shiftResult.error;
  }
  if (movementResult.error) throw movementResult.error;
  if (accountResult.error) throw accountResult.error;

  const counterAccounts = (accountResult.data || []).filter(
    (account) => String(account.id) !== String(cashAccountId || "")
  );

  return {
    actor,
    organization_id: organizationId,
    entity_id: scope.entityId,
    application_id: scope.applicationId,
    active_cash_session: shiftResult.data || null,
    cash_account_id: cashAccountId,
    counter_accounts: counterAccounts,
    movements: movementResult.data || [],
    policy: {
      requires_active_cash_session: true,
      requires_manager: true,
      requires_reason: true,
      requires_finance_counter_account: true,
      movements_affect_revenue: false,
      variance_posts_at_accounting_confirmation: true,
    },
  };
}

export async function executeCashMovement({
  body,
  access,
  application,
  organizationId,
  request,
}) {
  const actor = actorFromAccess(access);
  const scope = resolveScope({ body, application, request });
  await validateScope({ organizationId, entityId: scope.entityId });

  if (!actor.can_move_cash || !actor.staff_id) {
    const error = new Error(
      "Manager or owner role required for POS cash movements"
    );
    error.status = 403;
    throw error;
  }

  const movementType = String(
    body.movementType || body.movement_type || body.action || ""
  )
    .trim()
    .toUpperCase();
  if (!MOVEMENT_TYPES.has(movementType)) {
    const error = new Error(
      "movementType must be PAID_IN, PAID_OUT, ADJUSTMENT_IN or ADJUSTMENT_OUT"
    );
    error.status = 400;
    throw error;
  }

  const cashSessionId =
    body.cashSessionId ||
    body.cash_session_id ||
    body.sessionId ||
    body.session_id ||
    null;
  const counterAccountId =
    body.counterAccountId || body.counter_account_id || null;
  const amount = Number(body.amount || 0);
  const reason = String(body.reason || body.notes || "").trim();

  if (!cashSessionId) {
    const error = new Error("cashSessionId required");
    error.status = 400;
    throw error;
  }
  if (!counterAccountId) {
    const error = new Error("Finance counter account required");
    error.status = 400;
    throw error;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error("Cash movement amount must be greater than zero");
    error.status = 400;
    throw error;
  }
  if (!reason) {
    const error = new Error("Cash movement reason required");
    error.status = 400;
    throw error;
  }

  const idempotencyKey =
    body.idempotencyKey ||
    body.idempotency_key ||
    request?.headers?.get?.("idempotency-key") ||
    `pos-cash-movement:${organizationId}:${crypto.randomUUID()}`;

  const result = await supabaseAdmin.rpc("pos_record_cash_movement_atomic", {
    p_organization_id: organizationId,
    p_entity_id: scope.entityId,
    p_application_id: scope.applicationId,
    p_cash_session_id: cashSessionId,
    p_movement_type: movementType,
    p_amount: amount,
    p_counter_account_id: counterAccountId,
    p_actor_id: actor.staff_id,
    p_actor_role: actor.role,
    p_reason: reason,
    p_idempotency_key: String(idempotencyKey),
  });

  if (result.error) {
    if (
      result.error.code === "PGRST202" ||
      String(result.error.message || "").includes(
        "pos_record_cash_movement_atomic"
      )
    ) {
      const error = new Error(
        "POS cash movement lifecycle is not deployed in the database"
      );
      error.status = 503;
      throw error;
    }
    throw result.error;
  }

  const dispatch = await dispatchMovementEvent({
    organizationId,
    eventId: result.data?.event_id || null,
  });

  return {
    ...scope,
    movement_type: movementType,
    movement: result.data?.movement || null,
    session: result.data?.session || null,
    duplicate: Boolean(result.data?.duplicate),
    event_id: result.data?.event_id || null,
    dispatch_pending: dispatch.pending,
    dispatch_error: dispatch.error,
  };
}

export default Object.freeze({
  load: loadCashMovements,
  execute: executeCashMovement,
});
