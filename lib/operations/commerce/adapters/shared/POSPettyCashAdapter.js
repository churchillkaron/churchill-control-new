import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { runEventProcessors } from "@/lib/workers/system/runEventProcessors";

const CONTROL_ROLES = new Set([
  "MANAGER",
  "GENERAL_MANAGER",
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

const FINANCE_ROLES = new Set([
  "ACCOUNTING",
  "FINANCE",
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

function normalizedRole(access = {}) {
  return String(
    access.role || access.access?.role || access.membership?.role || access.staff?.role || ""
  )
    .trim()
    .toUpperCase();
}

function actorFromAccess(access = {}) {
  const role = normalizedRole(access);
  const staffId = access.access?.staffAccountId || access.staff?.id || null;
  return {
    user_id: access.user?.id || null,
    staff_id: staffId,
    staff_name:
      access.staff?.name || access.staff?.display_name || access.user?.email || null,
    role: role || null,
    can_request: Boolean(staffId && role),
    can_manage: Boolean(staffId && CONTROL_ROLES.has(role)),
    can_settle: Boolean(staffId && FINANCE_ROLES.has(role)),
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

function bodyValue(body, camelKey, snakeKey) {
  return body?.[camelKey] ?? body?.[snakeKey] ?? null;
}

function resolveScope({ body = {}, application, request }) {
  const entityId =
    bodyValue(body, "entityId", "entity_id") ||
    bodyValue(body, "legalEntityId", "legal_entity_id") ||
    requestValue(request, ["entityId", "entity_id", "legalEntityId", "legal_entity_id"]);

  const applicationId = String(
    bodyValue(body, "applicationId", "application_id") ||
      application?.id ||
      requestValue(request, ["applicationId", "application_id"]) ||
      "operations"
  )
    .trim()
    .toLowerCase();

  if (!entityId) {
    const error = new Error("Select an active legal entity for petty cash");
    error.status = 400;
    throw error;
  }

  return { entityId, applicationId: applicationId || "operations" };
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

async function dispatchEvent({ organizationId, eventId }) {
  if (!eventId) return { pending: false, error: null };
  try {
    const result = await runEventProcessors({ organizationId, eventId, limit: 1 });
    const pending = result?.success === false || Number(result?.failed || 0) > 0;
    return {
      pending,
      error: pending
        ? result?.failures?.[0]?.error || result?.error || "Petty cash event dispatch incomplete"
        : null,
    };
  } catch (error) {
    return {
      pending: true,
      error: error?.message || "Petty cash event dispatch failed",
    };
  }
}

function withDispatch(result, dispatch) {
  return {
    ...(result || {}),
    dispatch_pending: dispatch.pending,
    dispatch_error: dispatch.error,
  };
}

async function executeRpc({ organizationId, rpc, args }) {
  const result = await supabaseAdmin.rpc(rpc, args);
  if (result.error) throw result.error;
  const dispatch = await dispatchEvent({
    organizationId,
    eventId: result.data?.event_id || null,
  });
  return withDispatch(result.data, dispatch);
}

export async function loadPettyCash({
  access,
  application,
  organizationId,
  request,
}) {
  const actor = actorFromAccess(access);
  const scope = resolveScope({ application, request });
  await validateScope({ organizationId, entityId: scope.entityId });

  const [
    fundResult,
    requestResult,
    disbursementResult,
    receiptResult,
    replenishmentResult,
    locationResult,
    accountResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("operations_petty_cash_funds")
      .select(
        "id,cash_location_id,advance_account_id,replenish_source_location_id,currency_code,target_balance,is_active,created_by,updated_by,created_at,updated_at"
      )
      .eq("organization_id", organizationId)
      .eq("entity_id", scope.entityId)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("operations_petty_cash_requests")
      .select(
        "id,fund_id,source_application_id,requester_staff_id,purpose,requested_amount,approved_amount,currency_code,status,requested_at,approved_by,approved_at,approval_notes,rejected_by,rejected_at,rejection_reason,created_at,updated_at"
      )
      .eq("organization_id", organizationId)
      .eq("entity_id", scope.entityId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("operations_petty_cash_disbursements")
      .select(
        "id,fund_id,request_id,amount,currency_code,disbursement_date,disbursement_journal_id,status,disbursed_by,disbursed_at,settlement_date,settlement_reference,settlement_journal_id,settled_by,settled_at,cash_returned,created_at,updated_at"
      )
      .eq("organization_id", organizationId)
      .eq("entity_id", scope.entityId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("operations_petty_cash_receipts")
      .select(
        "id,disbursement_id,expense_account_id,amount,currency_code,receipt_date,receipt_reference,supplier,evidence_url,notes,submitted_by,submitted_at,created_at"
      )
      .eq("organization_id", organizationId)
      .eq("entity_id", scope.entityId)
      .order("created_at", { ascending: false })
      .limit(250),
    supabaseAdmin
      .from("operations_petty_cash_replenishments")
      .select(
        "id,fund_id,cash_transfer_id,amount,currency_code,reason,replenished_by,replenished_at,created_at"
      )
      .eq("organization_id", organizationId)
      .eq("entity_id", scope.entityId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("operations_cash_locations")
      .select(
        "id,name,location_type,finance_account_id,currency_code,current_balance,is_active"
      )
      .eq("organization_id", organizationId)
      .eq("entity_id", scope.entityId)
      .eq("is_active", true)
      .order("name"),
    supabaseAdmin
      .from("chart_of_accounts")
      .select(
        "id,account_code,account_name,account_category,account_type,currency_code,is_active"
      )
      .eq("organization_id", organizationId)
      .eq("entity_id", scope.entityId)
      .eq("is_active", true)
      .order("account_code"),
  ]);

  for (const result of [
    fundResult,
    requestResult,
    disbursementResult,
    receiptResult,
    replenishmentResult,
    locationResult,
    accountResult,
  ]) {
    if (result.error) throw result.error;
  }

  const locations = locationResult.data || [];
  const accounts = accountResult.data || [];

  return {
    actor,
    organization_id: organizationId,
    entity_id: scope.entityId,
    application_id: scope.applicationId,
    funds: fundResult.data || [],
    requests: requestResult.data || [],
    disbursements: disbursementResult.data || [],
    receipts: receiptResult.data || [],
    replenishments: replenishmentResult.data || [],
    petty_cash_locations: locations.filter(
      (row) => String(row.location_type || "").toUpperCase() === "PETTY_CASH"
    ),
    replenish_sources: locations.filter(
      (row) => String(row.location_type || "").toUpperCase() !== "BANK_DEPOSIT"
    ),
    advance_accounts: accounts.filter((row) => {
      const category = String(row.account_category || "").toUpperCase();
      const type = String(row.account_type || "").toUpperCase();
      return category.startsWith("ASSET") && type !== "CASH";
    }),
    expense_accounts: accounts.filter((row) => {
      const category = String(row.account_category || "").toUpperCase();
      return category.includes("EXPENSE") || category === "COGS";
    }),
    policy: {
      requester_may_submit: true,
      manager_approval_required: true,
      manager_self_approval_blocked_except_owner: true,
      disbursement_posts_to_finance: true,
      receipt_evidence_required: true,
      settlement_requires_finance_or_owner: true,
      replenishment_uses_cash_transfer_control: true,
      settled_evidence_immutable: true,
      changes_revenue: false,
    },
  };
}

export async function executePettyCashAction({
  body,
  access,
  application,
  organizationId,
  request,
}) {
  const actor = actorFromAccess(access);
  const scope = resolveScope({ body, application, request });
  await validateScope({ organizationId, entityId: scope.entityId });

  if (!actor.staff_id) {
    const error = new Error("Active organization staff account required for petty cash");
    error.status = 403;
    throw error;
  }

  const action = String(body.action || "").trim().toLowerCase();
  const idempotencyKey = String(
    bodyValue(body, "idempotencyKey", "idempotency_key") ||
      request?.headers?.get?.("idempotency-key") ||
      `operations-petty-cash:${action || "action"}:${crypto.randomUUID()}`
  );

  let result;

  switch (action) {
    case "configure_fund":
      result = await executeRpc({
        organizationId,
        rpc: "operations_configure_petty_cash_fund_atomic",
        args: {
          p_organization_id: organizationId,
          p_entity_id: scope.entityId,
          p_cash_location_id: bodyValue(body, "cashLocationId", "cash_location_id"),
          p_advance_account_id: bodyValue(body, "advanceAccountId", "advance_account_id"),
          p_replenish_source_location_id: bodyValue(
            body,
            "replenishSourceLocationId",
            "replenish_source_location_id"
          ),
          p_target_balance: bodyValue(body, "targetBalance", "target_balance"),
          p_actor_id: actor.staff_id,
        },
      });
      break;

    case "create_request":
      result = await executeRpc({
        organizationId,
        rpc: "operations_create_petty_cash_request_atomic",
        args: {
          p_organization_id: organizationId,
          p_entity_id: scope.entityId,
          p_source_application_id: scope.applicationId,
          p_fund_id: bodyValue(body, "fundId", "fund_id"),
          p_purpose: body.purpose || null,
          p_requested_amount: Number(bodyValue(body, "requestedAmount", "requested_amount") || 0),
          p_actor_id: actor.staff_id,
          p_idempotency_key: idempotencyKey,
        },
      });
      break;

    case "decide_request":
      result = await executeRpc({
        organizationId,
        rpc: "operations_decide_petty_cash_request_atomic",
        args: {
          p_organization_id: organizationId,
          p_entity_id: scope.entityId,
          p_request_id: bodyValue(body, "requestId", "request_id"),
          p_decision: body.decision || null,
          p_approved_amount: Number(bodyValue(body, "approvedAmount", "approved_amount") || 0),
          p_notes: body.notes || null,
          p_actor_id: actor.staff_id,
          p_idempotency_key: idempotencyKey,
        },
      });
      break;

    case "disburse":
      result = await executeRpc({
        organizationId,
        rpc: "operations_disburse_petty_cash_atomic",
        args: {
          p_organization_id: organizationId,
          p_entity_id: scope.entityId,
          p_request_id: bodyValue(body, "requestId", "request_id"),
          p_disbursement_date: bodyValue(body, "disbursementDate", "disbursement_date"),
          p_actor_id: actor.staff_id,
          p_idempotency_key: idempotencyKey,
        },
      });
      break;

    case "add_receipt":
      result = await executeRpc({
        organizationId,
        rpc: "operations_add_petty_cash_receipt_atomic",
        args: {
          p_organization_id: organizationId,
          p_entity_id: scope.entityId,
          p_disbursement_id: bodyValue(body, "disbursementId", "disbursement_id"),
          p_expense_account_id: bodyValue(body, "expenseAccountId", "expense_account_id"),
          p_amount: Number(body.amount || 0),
          p_receipt_date: bodyValue(body, "receiptDate", "receipt_date"),
          p_receipt_reference: bodyValue(body, "receiptReference", "receipt_reference"),
          p_supplier: body.supplier || null,
          p_evidence_url: bodyValue(body, "evidenceUrl", "evidence_url"),
          p_notes: body.notes || null,
          p_actor_id: actor.staff_id,
          p_idempotency_key: idempotencyKey,
        },
      });
      break;

    case "settle":
      result = await executeRpc({
        organizationId,
        rpc: "operations_settle_petty_cash_atomic",
        args: {
          p_organization_id: organizationId,
          p_entity_id: scope.entityId,
          p_disbursement_id: bodyValue(body, "disbursementId", "disbursement_id"),
          p_settlement_date: bodyValue(body, "settlementDate", "settlement_date"),
          p_settlement_reference: bodyValue(
            body,
            "settlementReference",
            "settlement_reference"
          ),
          p_actor_id: actor.staff_id,
          p_idempotency_key: idempotencyKey,
        },
      });
      break;

    case "replenish":
      result = await executeRpc({
        organizationId,
        rpc: "operations_replenish_petty_cash_atomic",
        args: {
          p_organization_id: organizationId,
          p_entity_id: scope.entityId,
          p_fund_id: bodyValue(body, "fundId", "fund_id"),
          p_amount: Number(body.amount || 0),
          p_reason: body.reason || null,
          p_actor_id: actor.staff_id,
          p_idempotency_key: idempotencyKey,
        },
      });
      break;

    default: {
      const error = new Error(`Unsupported petty cash action: ${action || "missing"}`);
      error.status = 400;
      throw error;
    }
  }

  return {
    entityId: scope.entityId,
    applicationId: scope.applicationId,
    action,
    ...result,
  };
}

export default Object.freeze({
  load: loadPettyCash,
  execute: executePettyCashAction,
});
