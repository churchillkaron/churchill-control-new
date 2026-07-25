import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getPostingRule } from "@/lib/finance/general-ledger/repositories/getPostingRule";
import { loadPeriodCloseContext } from "./PeriodCloseExecutionService";
import {
  loadPeriodCloseChecklist,
  runPeriodCloseStep as runBasePeriodCloseStep,
} from "./PeriodCloseStepApplicationService";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function finiteNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} must be numeric`);
  return number;
}

function uuidOrNull(value) {
  const normalized = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

function isDebitNormal(account = {}) {
  const normalBalance = String(account.normal_balance || "")
    .trim()
    .toLowerCase();

  if (normalBalance) return normalBalance === "debit";

  const classification = String(
    account.account_category || account.account_type || ""
  ).toLowerCase();

  return /asset|expense|cost|cogs/.test(classification);
}

async function resolveClosingRate({
  context,
  foreignCurrency,
  explicitRate,
}) {
  if (explicitRate !== undefined && explicitRate !== null && explicitRate !== "") {
    const rate = finiteNumber(explicitRate, "closing_rate");
    if (rate <= 0) throw new Error("closing_rate must be positive");
    return rate;
  }

  const { data, error } = await supabaseAdmin
    .from("finance_exchange_rates")
    .select("rate, effective_date, entity_id")
    .eq("organization_id", context.organizationId)
    .or(`entity_id.eq.${context.entityId},entity_id.is.null`)
    .eq("from_currency", foreignCurrency)
    .eq("to_currency", context.currencyCode)
    .eq("status", "ACTIVE")
    .lte("effective_date", context.period.end_date)
    .order("entity_id", { ascending: false, nullsFirst: false })
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error(
      `No closing exchange rate configured for ${foreignCurrency}/${context.currencyCode}`
    );
  }

  const rate = Number(data.rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(
      `Invalid closing exchange rate for ${foreignCurrency}/${context.currencyCode}`
    );
  }

  return rate;
}

async function runFXRevaluation(input) {
  const context = await loadPeriodCloseContext(input);
  const functionalCurrency = required(context.currencyCode, "currencyCode");
  const { data: configured, error: configuredError } = await supabaseAdmin
    .from("finance_fx_revaluation_accounts")
    .select("account_id")
    .eq("organization_id", context.organizationId)
    .eq("entity_id", context.entityId)
    .eq("status", "ACTIVE");

  if (configuredError) throw configuredError;

  if (!(configured || []).length) {
    return runBasePeriodCloseStep({
      ...input,
      stepType: "FX_REVALUATION",
      revaluations: [],
    });
  }

  const configuredIds = configured.map(row => row.account_id);
  const { data: accounts, error: accountError } = await supabaseAdmin
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_category, account_type, normal_balance")
    .eq("organization_id", context.organizationId)
    .eq("entity_id", context.entityId)
    .in("id", configuredIds);

  if (accountError) throw accountError;

  const accountsById = new Map(
    (accounts || []).map(account => [String(account.id), account])
  );
  const rows = Array.isArray(input.revaluations) ? input.revaluations : [];

  if (!rows.length) {
    throw new Error(
      "FX revaluation inputs required: provide account_id, foreign_currency, foreign_balance, and carrying_value"
    );
  }

  const prepared = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || {};
    const accountId = required(
      row.account_id || row.accountId,
      `account_id on row ${index + 1}`
    );
    const account = accountsById.get(accountId);

    if (!account) {
      throw new Error(
        `FX revaluation account is not configured for selected entity: ${accountId}`
      );
    }

    const foreignCurrency = required(
      row.foreign_currency || row.foreignCurrency,
      `foreign_currency on row ${index + 1}`
    ).toUpperCase();

    if (foreignCurrency === functionalCurrency) {
      throw new Error(`FX revaluation row ${index + 1} uses the functional currency`);
    }

    const foreignBalance = finiteNumber(
      row.foreign_balance ?? row.foreignBalance,
      `foreign_balance on row ${index + 1}`
    );
    const carryingValue = finiteNumber(
      row.carrying_value ?? row.carryingValue,
      `carrying_value on row ${index + 1}`
    );
    const closingRate = await resolveClosingRate({
      context,
      foreignCurrency,
      explicitRate: row.closing_rate ?? row.closingRate,
    });
    const closingValue = foreignBalance * closingRate;
    const balanceChange = closingValue - carryingValue;

    if (Math.abs(balanceChange) > 0.005) {
      prepared.push({
        account,
        account_id: accountId,
        foreign_currency: foreignCurrency,
        foreign_balance: foreignBalance,
        carrying_value: carryingValue,
        closing_value: closingValue,
        closing_rate: closingRate,
        gain_loss: balanceChange,
      });
    }
  }

  if (!prepared.length) {
    return runBasePeriodCloseStep({
      ...input,
      stepType: "FX_REVALUATION",
      revaluations: rows.map(row => ({
        ...row,
        carrying_value: row.carrying_value ?? row.carryingValue,
        foreign_balance: row.foreign_balance ?? row.foreignBalance,
      })),
    });
  }

  const rule = await getPostingRule({
    organizationId: context.organizationId,
    entityId: context.entityId,
    eventType: "FX_REVALUATION",
  });
  const journalLines = [];
  const persistedRows = [];

  for (const row of prepared) {
    const amount = Math.abs(row.gain_loss);
    const accountDebit = isDebitNormal(row.account)
      ? row.gain_loss > 0
      : row.gain_loss < 0;
    const economicGain = accountDebit;

    journalLines.push({
      account_id: row.account_id,
      debit: accountDebit ? amount : 0,
      credit: accountDebit ? 0 : amount,
      description: `${row.foreign_currency} closing-rate revaluation`,
    });
    journalLines.push({
      account_id: economicGain
        ? rule.credit_account_id
        : rule.debit_account_id,
      debit: economicGain ? 0 : amount,
      credit: economicGain ? amount : 0,
      description: economicGain ? "Unrealised FX gain" : "Unrealised FX loss",
    });
    persistedRows.push({
      account_id: row.account_id,
      foreign_currency: row.foreign_currency,
      foreign_balance: row.foreign_balance,
      carrying_value: row.carrying_value,
      closing_value: row.closing_value,
      closing_rate: row.closing_rate,
      gain_loss: economicGain ? amount : -amount,
    });
  }

  const { data, error } = await supabaseAdmin.rpc(
    "finance_run_fx_revaluation_atomic",
    {
      p_organization_id: context.organizationId,
      p_entity_id: context.entityId,
      p_period_id: context.periodId,
      p_revaluations: persistedRows,
      p_currency_code: functionalCurrency,
      p_journal_lines: journalLines,
      p_created_by: uuidOrNull(input.completedBy),
      p_idempotency_key: required(input.idempotencyKey, "idempotencyKey"),
    }
  );

  if (error) throw new Error(`FX revaluation failed: ${error.message}`);
  return data;
}

export async function runPeriodCloseStep(input = {}) {
  const step = required(
    input.stepType || input.step_type,
    "stepType"
  ).toUpperCase();

  if (step === "FX_REVALUATION") {
    return runFXRevaluation({
      ...input,
      organizationId: input.organizationId || input.organization_id,
      entityId: input.entityId || input.entity_id,
      periodId: input.periodId || input.period_id,
      completedBy: input.completedBy || input.completed_by || null,
      idempotencyKey: input.idempotencyKey || input.idempotency_key,
    });
  }

  return runBasePeriodCloseStep(input);
}

export { loadPeriodCloseChecklist };
