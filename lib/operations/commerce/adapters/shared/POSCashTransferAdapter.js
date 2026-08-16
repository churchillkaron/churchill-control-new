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
  ).trim().toUpperCase();
}

function actorFromAccess(access = {}) {
  const role = normalizedRole(access);
  return {
    user_id: access.user?.id || null,
    staff_id: access.access?.staffAccountId || access.staff?.id || null,
    staff_name: access.staff?.name || access.staff?.display_name || access.user?.email || null,
    role: role || null,
    can_control_cash: CONTROL_ROLES.has(role),
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
    body.entityId || body.entity_id || body.legalEntityId || body.legal_entity_id ||
    requestValue(request, ["entityId", "entity_id", "legalEntityId", "legal_entity_id"]);
  const applicationId = String(
    body.applicationId || body.application_id || application?.id ||
    requestValue(request, ["applicationId", "application_id"]) || ""
  ).trim().toLowerCase();

  if (!entityId) {
    const error = new Error("Select an active legal entity for cash transfers");
    error.status = 400;
    throw error;
  }
  if (!applicationId) {
    const error = new Error("POS application required for cash transfers");
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

async function dispatchEvent({ organizationId, eventId }) {
  if (!eventId) return { pending: false, error: null };
  try {
    const result = await runEventProcessors({ organizationId, eventId, limit: 1 });
    const pending = result?.success === false || Number(result?.failed || 0) > 0;
    return {
      pending,
      error: pending ? result?.failures?.[0]?.error || result?.error || "Cash transfer event dispatch incomplete" : null,
    };
  } catch (error) {
    return { pending: true, error: error?.message || "Cash transfer event dispatch failed" };
  }
}

export async function loadCashTransfers({ access, application, organizationId, request }) {
  const actor = actorFromAccess(access);
  const scope = resolveScope({ application, request });
  await validateScope({ organizationId, entityId: scope.entityId });

  const drawerAccountResult = await supabaseAdmin.rpc("operations_resolve_pos_cash_account", {
    p_organization_id: organizationId,
    p_entity_id: scope.entityId,
  });
  if (drawerAccountResult.error) throw drawerAccountResult.error;
  const drawerAccountId = drawerAccountResult.data || null;

  const [locationResult, transferResult, accountResult, shiftResult] = await Promise.all([
    supabaseAdmin
      .from("operations_cash_locations")
      .select("id,name,location_type,finance_account_id,currency_code,current_balance,is_active,created_at")
      .eq("organization_id", organizationId)
      .eq("entity_id", scope.entityId)
      .eq("is_active", true)
      .order("name"),
    supabaseAdmin
      .from("operations_cash_transfers")
      .select("id,application_id,transfer_type,source_location_id,destination_location_id,source_cash_session_id,destination_cash_session_id,amount,currency_code,source_account_id,destination_account_id,journal_entry_id,drawer_movement_id,reason,status,created_by,created_at")
      .eq("organization_id", organizationId)
      .eq("entity_id", scope.entityId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("chart_of_accounts")
      .select("id,account_code,account_name,account_category,account_type,currency_code,is_active")
      .eq("organization_id", organizationId)
      .eq("entity_id", scope.entityId)
      .eq("is_active", true)
      .order("account_code"),
    supabaseAdmin
      .from("pos_shifts")
      .select("id,status,locked,opening_cash,expected_cash,opened_at")
      .eq("organization_id", organizationId)
      .eq("entity_id", scope.entityId)
      .eq("application_id", scope.applicationId)
      .in("status", ["OPEN", "ACTIVE"])
      .eq("locked", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (locationResult.error) throw locationResult.error;
  if (transferResult.error) throw transferResult.error;
  if (accountResult.error) throw accountResult.error;
  if (shiftResult.error && shiftResult.error.code !== "PGRST116") throw shiftResult.error;

  const locations = locationResult.data || [];
  const usedAccounts = new Set(locations.map((row) => String(row.finance_account_id)));
  const availableAccounts = (accountResult.data || []).filter((account) => {
    const category = String(account.account_category || "").toUpperCase();
    const accountType = String(account.account_type || "").toUpperCase();
    return (
      category.startsWith("ASSET") &&
      accountType === "CASH" &&
      String(account.id) !== String(drawerAccountId || "") &&
      !usedAccounts.has(String(account.id))
    );
  });

  return {
    actor,
    organization_id: organizationId,
    entity_id: scope.entityId,
    application_id: scope.applicationId,
    drawer_account_id: drawerAccountId,
    active_cash_session: shiftResult.data || null,
    locations,
    transfers: transferResult.data || [],
    available_finance_accounts: availableAccounts,
    policy: {
      requires_manager: true,
      transfer_changes_revenue: false,
      separate_finance_accounts_required: true,
      cash_account_type_required: true,
      supported_location_types: ["SAFE", "PETTY_CASH", "CASH_OFFICE", "BANK_DEPOSIT", "OTHER"],
      supported_transfer_types: ["DRAWER_TO_LOCATION", "LOCATION_TO_DRAWER", "LOCATION_TO_LOCATION"],
    },
  };
}

export async function executeCashTransfer({ body, access, application, organizationId, request }) {
  const actor = actorFromAccess(access);
  const scope = resolveScope({ body, application, request });
  await validateScope({ organizationId, entityId: scope.entityId });

  if (!actor.can_control_cash || !actor.staff_id) {
    const error = new Error("Manager or owner role required for controlled cash transfers");
    error.status = 403;
    throw error;
  }

  const action = String(body.action || "TRANSFER").trim().toUpperCase();
  const idempotencyKey = String(
    body.idempotencyKey || body.idempotency_key || request?.headers?.get?.("idempotency-key") ||
    `operations-cash:${crypto.randomUUID()}`
  );

  if (action === "CREATE_LOCATION") {
    const result = await supabaseAdmin.rpc("operations_create_cash_location_atomic", {
      p_organization_id: organizationId,
      p_entity_id: scope.entityId,
      p_name: body.name,
      p_location_type: body.locationType || body.location_type,
      p_finance_account_id: body.financeAccountId || body.finance_account_id,
      p_actor_id: actor.staff_id,
      p_actor_role: actor.role,
      p_idempotency_key: idempotencyKey,
    });
    if (result.error) throw result.error;
    return { ...scope, ...result.data };
  }

  if (action !== "TRANSFER") {
    const error = new Error("Unsupported controlled cash action");
    error.status = 400;
    throw error;
  }

  const result = await supabaseAdmin.rpc("operations_record_cash_transfer_atomic", {
    p_organization_id: organizationId,
    p_entity_id: scope.entityId,
    p_application_id: scope.applicationId,
    p_transfer_type: body.transferType || body.transfer_type,
    p_source_location_id: body.sourceLocationId || body.source_location_id || null,
    p_destination_location_id: body.destinationLocationId || body.destination_location_id || null,
    p_source_cash_session_id: body.sourceCashSessionId || body.source_cash_session_id || null,
    p_destination_cash_session_id: body.destinationCashSessionId || body.destination_cash_session_id || null,
    p_amount: Number(body.amount || 0),
    p_actor_id: actor.staff_id,
    p_actor_role: actor.role,
    p_reason: body.reason,
    p_idempotency_key: idempotencyKey,
  });
  if (result.error) throw result.error;

  const dispatch = await dispatchEvent({ organizationId, eventId: result.data?.event_id || null });
  return {
    ...scope,
    ...result.data,
    dispatch_pending: dispatch.pending,
    dispatch_error: dispatch.error,
  };
}

export default Object.freeze({ load: loadCashTransfers, execute: executeCashTransfer });
