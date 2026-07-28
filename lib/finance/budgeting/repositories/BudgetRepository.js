import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { AccountRepository } from "@/lib/finance/chart-of-accounts/repositories/AccountRepository";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function positiveNumber(value, field) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`${field} must be a non-negative number`);
  }
  return numeric;
}

function integerInRange(value, field, min, max) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
    throw new Error(`${field} must be between ${min} and ${max}`);
  }
  return numeric;
}

function currencyCode(value) {
  const normalized = required(value, "currency_code").toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("currency_code must be a valid three-letter currency code");
  }
  return normalized;
}

async function validateContext({ organizationId, entityId, periodId, accountId }) {
  const entity = await resolveEntity({ organizationId, entityId });
  if (!entity) throw new Error("Legal entity not found in organisation");

  const { data: period, error: periodError } = await supabaseAdmin
    .from("accounting_periods")
    .select("id, organization_id, entity_id, name, start_date, end_date, status")
    .eq("organization_id", organizationId)
    .eq("entity_id", entity.id)
    .eq("id", periodId)
    .maybeSingle();

  if (periodError) throw periodError;
  if (!period) throw new Error("Accounting period not found in selected legal entity");
  if (["closed", "locked"].includes(String(period.status || "").toLowerCase())) {
    throw new Error("Budget cannot be created in a closed or locked accounting period");
  }

  const account = await AccountRepository.get({
    organizationId,
    entityId: entity.id,
    accountId,
  });
  if (!account) throw new Error("Budget account not found in selected legal entity");

  return { entity, period, account };
}

export async function createBudget({
  organizationId,
  entityId,
  periodId,
  accountId,
  category = null,
  amount,
  month,
  year,
  currency,
  idempotencyKey = null,
  createdBy = null,
}) {
  const organization_id = required(organizationId, "organization_id");
  const entity_id = required(entityId, "entity_id");
  const period_id = required(periodId, "period_id");
  const account_id = required(accountId, "account_id");
  const numericAmount = positiveNumber(amount, "amount");
  const numericMonth = integerInRange(month, "month", 1, 12);
  const numericYear = integerInRange(year, "year", 1900, 9999);
  const currency_code = currencyCode(currency);
  const context = await validateContext({
    organizationId: organization_id,
    entityId: entity_id,
    periodId: period_id,
    accountId: account_id,
  });

  const expectedYear = Number(String(context.period.start_date || "").slice(0, 4));
  if (Number.isFinite(expectedYear) && numericYear !== expectedYear) {
    throw new Error("Budget year must match the selected accounting period");
  }

  const key = String(idempotencyKey || "").trim() || null;
  if (key) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("finance_budgets")
      .select("*")
      .eq("organization_id", organization_id)
      .eq("entity_id", context.entity.id)
      .eq("idempotency_key", key)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) return { ...existing, unchanged: true };
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("finance_budgets")
    .insert({
      organization_id,
      entity_id: context.entity.id,
      period_id,
      account_id,
      category: String(category || context.account.account_category || "").trim() || null,
      amount: numericAmount,
      month: numericMonth,
      year: numericYear,
      currency_code,
      status: "DRAFT",
      idempotency_key: key,
      created_by: createdBy || null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function listBudgets({ organizationId, entityId, periodId = null }) {
  required(organizationId, "organization_id");
  required(entityId, "entity_id");

  const entity = await resolveEntity({ organizationId, entityId });
  if (!entity) throw new Error("Legal entity not found in organisation");

  let query = supabaseAdmin
    .from("finance_budgets")
    .select("*, chart_of_accounts(account_code, account_name, account_category)")
    .eq("organization_id", organizationId)
    .eq("entity_id", entity.id)
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  if (periodId) query = query.eq("period_id", periodId);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map(row => ({
    ...row,
    account_code: row.chart_of_accounts?.account_code || null,
    account_name: row.chart_of_accounts?.account_name || null,
    account_category: row.chart_of_accounts?.account_category || row.category || null,
  }));
}
