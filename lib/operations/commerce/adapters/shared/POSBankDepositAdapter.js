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

function normalizedRole(access = {}) {
  return String(
    access.role || access.access?.role || access.membership?.role || access.staff?.role || ""
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
      access.staff?.name || access.staff?.display_name || access.user?.email || null,
    role: role || null,
    can_submit: CONTROL_ROLES.has(role),
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
    ]);

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
    const error = new Error("Select an active legal entity for bank deposits");
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
    const result = await runEventProcessors({
      organizationId,
      eventId,
      limit: 1,
    });
    const pending =
      result?.success === false || Number(result?.failed || 0) > 0;
    return {
      pending,
      error: pending
        ? result?.failures?.[0]?.error ||
          result?.error ||
          "Bank deposit event dispatch incomplete"
        : null,
    };
  } catch (error) {
    return {
      pending: true,
      error: error?.message || "Bank deposit event dispatch failed",
    };
  }
}

export async function loadBankDeposits({
  access,
  application,
  organizationId,
  request,
}) {
  const actor = actorFromAccess(access);
  const scope = resolveScope({ application, request });
  await validateScope({ organizationId, entityId: scope.entityId });

  const [depositResult, locationResult, bankResult] = await Promise.all([
    supabaseAdmin
      .from("operations_bank_deposits")
      .select(
        "id,source_application_id,source_location_id,transit_location_id,bank_account_id,cash_transfer_id,amount,currency_code,deposit_date,deposit_reference,evidence_url,notes,status,bank_journal_entry_id,bank_ledger_id,submitted_by,submitted_at,accounting_confirmed_by,accounting_confirmed_at,confirmation_reference,created_at,updated_at"
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
      .from("bank_accounts")
      .select(
        "id,bank_name,account_name,account_number,currency,currency_code,branch_name,account_type,finance_account_id,is_default,active"
      )
      .eq("organization_id", organizationId)
      .eq("entity_id", scope.entityId)
      .eq("active", true)
      .order("is_default", { ascending: false })
      .order("bank_name"),
  ]);

  if (depositResult.error) throw depositResult.error;
  if (locationResult.error) throw locationResult.error;
  if (bankResult.error) throw bankResult.error;

  const locations = locationResult.data || [];

  return {
    actor,
    organization_id: organizationId,
    entity_id: scope.entityId,
    application_id: scope.applicationId,
    deposits: depositResult.data || [],
    source_locations: locations.filter(
      (row) => String(row.location_type || "").toUpperCase() !== "BANK_DEPOSIT"
    ),
    transit_locations: locations.filter(
      (row) => String(row.location_type || "").toUpperCase() === "BANK_DEPOSIT"
    ),
    bank_accounts: bankResult.data || [],
    policy: {
      requires_manager_submission: true,
      requires_finance_confirmation: true,
      changes_revenue: false,
      bank_confirmation_requires_mapped_finance_account: true,
      bank_reconciliation_owned_by_finance: true,
      source_balance_protected: true,
      submitted_evidence_immutable: true,
    },
  };
}

export async function submitBankDeposit({
  body,
  access,
  application,
  organizationId,
  request,
}) {
  const actor = actorFromAccess(access);
  const scope = resolveScope({ body, application, request });
  await validateScope({ organizationId, entityId: scope.entityId });

  if (!actor.can_submit || !actor.staff_id) {
    const error = new Error("Manager or owner role required to submit bank deposits");
    error.status = 403;
    throw error;
  }

  const idempotencyKey = String(
    body.idempotencyKey ||
      body.idempotency_key ||
      request?.headers?.get?.("idempotency-key") ||
      `operations-bank-deposit:${crypto.randomUUID()}`
  );

  const result = await supabaseAdmin.rpc("operations_submit_bank_deposit_atomic", {
    p_organization_id: organizationId,
    p_entity_id: scope.entityId,
    p_source_application_id: scope.applicationId,
    p_source_location_id:
      body.sourceLocationId || body.source_location_id || null,
    p_transit_location_id:
      body.transitLocationId || body.transit_location_id || null,
    p_bank_account_id: body.bankAccountId || body.bank_account_id || null,
    p_amount: Number(body.amount || 0),
    p_deposit_date: body.depositDate || body.deposit_date || null,
    p_deposit_reference:
      body.depositReference || body.deposit_reference || null,
    p_evidence_url: body.evidenceUrl || body.evidence_url || null,
    p_notes: body.notes || null,
    p_actor_id: actor.staff_id,
    p_actor_role: actor.role,
    p_idempotency_key: idempotencyKey,
  });

  if (result.error) throw result.error;

  const dispatch = await dispatchEvent({
    organizationId,
    eventId: result.data?.event_id || null,
  });

  return {
    ...scope,
    ...result.data,
    dispatch_pending: dispatch.pending,
    dispatch_error: dispatch.error,
  };
}

export default Object.freeze({
  load: loadBankDeposits,
  execute: submitBankDeposit,
});
