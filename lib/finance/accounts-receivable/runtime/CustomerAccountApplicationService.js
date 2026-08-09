import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function required(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function uuid(value, field) {
  const normalized = required(value, field);
  if (!UUID_PATTERN.test(normalized)) throw new Error(`${field} must be a UUID`);
  return normalized;
}

function optionalUuid(value, field) {
  if (value === null || value === undefined || value === "") return null;
  return uuid(value, field);
}

function rpcError(result, fallback) {
  if (!result?.error) return;
  throw new Error(result.error.message || fallback);
}

export async function getCustomerAccountCommand(input = {}) {
  const organizationId = uuid(input.organization_id, "organization_id");
  const entityId = uuid(input.entity_id, "entity_id");
  const partyId = uuid(input.party_id, "party_id");
  const asOfDate = input.as_of_date || new Date().toISOString().slice(0, 10);

  const result = await supabaseAdmin.rpc("finance_get_customer_account_party", {
    p_organization_id: organizationId,
    p_entity_id: entityId,
    p_party_id: partyId,
    p_as_of_date: asOfDate,
  });

  rpcError(result, "Unable to load customer account");
  return result.data;
}

export async function generateCustomerStatementCommand(input = {}) {
  const result = await supabaseAdmin.rpc(
    "finance_generate_customer_statement_party_idempotent",
    {
      p_statement_id: optionalUuid(input.statement_id, "statement_id") || randomUUID(),
      p_organization_id: uuid(input.organization_id, "organization_id"),
      p_entity_id: uuid(input.entity_id, "entity_id"),
      p_party_id: uuid(input.party_id, "party_id"),
      p_statement_date: required(input.statement_date, "statement_date"),
      p_period_start: required(input.period_start, "period_start"),
      p_period_end: required(input.period_end, "period_end"),
      p_currency_code: required(input.currency_code, "currency_code"),
      p_generated_by: optionalUuid(input.generated_by, "generated_by"),
      p_idempotency_key: required(input.idempotency_key, "idempotency_key"),
      p_prefix: input.prefix || "STAT",
    }
  );

  rpcError(result, "Unable to generate customer statement");
  return result.data;
}

export async function openCustomerCollectionCaseCommand(input = {}) {
  const result = await supabaseAdmin.rpc(
    "finance_open_customer_collection_case_party_idempotent",
    {
      p_case_id: optionalUuid(input.case_id, "case_id") || randomUUID(),
      p_organization_id: uuid(input.organization_id, "organization_id"),
      p_entity_id: uuid(input.entity_id, "entity_id"),
      p_party_id: uuid(input.party_id, "party_id"),
      p_customer_invoice_id: optionalUuid(input.customer_invoice_id, "customer_invoice_id"),
      p_accounts_receivable_id: optionalUuid(input.accounts_receivable_id, "accounts_receivable_id"),
      p_priority: input.priority || "NORMAL",
      p_assigned_to: optionalUuid(input.assigned_to, "assigned_to"),
      p_promise_amount:
        input.promise_amount === null || input.promise_amount === undefined || input.promise_amount === ""
          ? null
          : Number(input.promise_amount),
      p_promise_date: input.promise_date || null,
      p_next_follow_up_at: input.next_follow_up_at || null,
      p_disputed: input.disputed ?? false,
      p_hold_reason: input.hold_reason || null,
      p_opened_by: optionalUuid(input.opened_by, "opened_by"),
      p_idempotency_key: required(input.idempotency_key, "idempotency_key"),
      p_prefix: input.prefix || "COL",
    }
  );

  rpcError(result, "Unable to open customer collection case");
  return result.data;
}

export async function recordCustomerCollectionActivityCommand(input = {}) {
  const result = await supabaseAdmin.rpc(
    "finance_record_customer_collection_activity_party_idempotent",
    {
      p_activity_id: optionalUuid(input.activity_id, "activity_id") || randomUUID(),
      p_organization_id: uuid(input.organization_id, "organization_id"),
      p_entity_id: uuid(input.entity_id, "entity_id"),
      p_party_id: uuid(input.party_id, "party_id"),
      p_collection_case_id: uuid(input.collection_case_id, "collection_case_id"),
      p_customer_invoice_id: optionalUuid(input.customer_invoice_id, "customer_invoice_id"),
      p_activity_type: required(input.activity_type, "activity_type"),
      p_notes: input.notes || null,
      p_outcome: input.outcome || null,
      p_follow_up_at: input.follow_up_at || null,
      p_promise_amount:
        input.promise_amount === null || input.promise_amount === undefined || input.promise_amount === ""
          ? null
          : Number(input.promise_amount),
      p_promise_date: input.promise_date || null,
      p_performed_by: optionalUuid(input.performed_by, "performed_by"),
      p_case_status: input.case_status || null,
      p_disputed:
        input.disputed === null || input.disputed === undefined ? null : Boolean(input.disputed),
      p_hold_reason: input.hold_reason ?? null,
      p_idempotency_key: required(input.idempotency_key, "idempotency_key"),
    }
  );

  rpcError(result, "Unable to record collection activity");
  return result.data;
}

export const CustomerAccountApplicationService = Object.freeze({
  getCustomerAccount: getCustomerAccountCommand,
  generateStatement: generateCustomerStatementCommand,
  openCollectionCase: openCustomerCollectionCaseCommand,
  recordCollectionActivity: recordCustomerCollectionActivityCommand,
});

export default CustomerAccountApplicationService;
