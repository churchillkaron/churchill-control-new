import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getPostingRule } from "@/lib/finance/general-ledger/repositories/getPostingRule";
import { loadLedgerAccountBalances } from "@/lib/finance/reporting/reports/loadLedgerAccountBalances";
import {
  loadPeriodCloseContext,
  postPeriodAdjustment,
  recordPeriodCloseStep,
} from "./PeriodCloseExecutionService";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function positive(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${field} must be positive`);
  }
  return number;
}

function uuidOrNull(value) {
  const normalized = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

async function runDepreciation(input) {
  const context = await loadPeriodCloseContext(input);
  const { data: assets, error } = await supabaseAdmin
    .from("fixed_assets")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("entity_id", context.entityId)
    .eq("status", "active")
    .lte("purchase_date", context.period.end_date);

  if (error) throw error;

  const entries = (assets || [])
    .map(asset => {
      const cost = Number(asset.purchase_cost || 0);
      const salvage = Number(asset.salvage_value || 0);
      const lifeYears = Number(asset.useful_life_years || 0);
      const bookValue = Number(asset.current_book_value ?? cost);
      const remaining = Math.max(bookValue - salvage, 0);
      const monthly = lifeYears > 0
        ? Math.max((cost - salvage) / (lifeYears * 12), 0)
        : 0;
      const amount = Math.min(monthly, remaining);

      return amount > 0
        ? { fixed_asset_id: asset.id, amount }
        : null;
    })
    .filter(Boolean);

  if (!entries.length) {
    return recordPeriodCloseStep({
      ...input,
      stepType: "DEPRECIATION",
      status: "SKIPPED",
      evidence: {
        reason: "No active fixed assets have depreciable value in the selected period",
        asset_count: 0,
      },
    });
  }

  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const rule = await getPostingRule({
    organizationId: context.organizationId,
    entityId: context.entityId,
    eventType: "DEPRECIATION_POSTED",
  });
  const journalLines = [
    {
      account_id: rule.debit_account_id,
      debit: total,
      credit: 0,
      description: "Period depreciation expense",
    },
    {
      account_id: rule.credit_account_id,
      debit: 0,
      credit: total,
      description: "Accumulated depreciation",
    },
  ];

  const { data, error: rpcError } = await supabaseAdmin.rpc(
    "finance_run_period_depreciation_atomic",
    {
      p_organization_id: context.organizationId,
      p_entity_id: context.entityId,
      p_period_id: context.periodId,
      p_entries: entries,
      p_currency_code: required(context.currencyCode, "currencyCode"),
      p_exchange_rate: 1,
      p_journal_lines: journalLines,
      p_created_by: uuidOrNull(input.completedBy),
      p_idempotency_key: required(input.idempotencyKey, "idempotencyKey"),
    }
  );

  if (rpcError) throw new Error(`Period depreciation failed: ${rpcError.message}`);
  return data;
}

async function runFXRevaluation(input) {
  const context = await loadPeriodCloseContext(input);
  const functionalCurrency = required(context.currencyCode, "currencyCode");
  const { data: configuredAccounts, error: accountError } = await supabaseAdmin
    .from("finance_fx_revaluation_accounts")
    .select("account_id")
    .eq("organization_id", context.organizationId)
    .eq("entity_id", context.entityId)
    .eq("status", "ACTIVE");

  if (accountError) throw accountError;

  if (!(configuredAccounts || []).length) {
    return recordPeriodCloseStep({
      ...input,
      stepType: "FX_REVALUATION",
      status: "SKIPPED",
      evidence: {
        reason: "No foreign-currency balance-sheet accounts are configured for revaluation",
      },
    });
  }

  const accountIds = configuredAccounts.map(row => row.account_id);
  const { data: ledgerRows, error: ledgerError } = await supabaseAdmin
    .from("general_ledger")
    .select("account_id, currency_code, debit, credit")
    .eq("organization_id", context.organizationId)
    .eq("entity_id", context.entityId)
    .in("account_id", accountIds)
    .lte("posting_date", context.period.end_date)
    .neq("currency_code", functionalCurrency);

  if (ledgerError) throw ledgerError;

  const balances = new Map();
  for (const row of ledgerRows || []) {
    const key = `${row.account_id}:${String(row.currency_code || "").toUpperCase()}`;
    const current = balances.get(key) || {
      account_id: row.account_id,
      foreign_currency: String(row.currency_code || "").toUpperCase(),
      foreign_balance: 0,
    };
    current.foreign_balance += Number(row.debit || 0) - Number(row.credit || 0);
    balances.set(key, current);
  }

  const revaluations = [];
  for (const balance of balances.values()) {
    const { data: rate, error: rateError } = await supabaseAdmin
      .from("finance_exchange_rates")
      .select("rate, effective_date")
      .eq("organization_id", context.organizationId)
      .or(`entity_id.eq.${context.entityId},entity_id.is.null`)
      .eq("from_currency", balance.foreign_currency)
      .eq("to_currency", functionalCurrency)
      .eq("status", "ACTIVE")
      .lte("effective_date", context.period.end_date)
      .order("entity_id", { ascending: false, nullsFirst: false })
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (rateError) throw rateError;
    if (!rate) {
      throw new Error(`No closing exchange rate configured for ${balance.foreign_currency}/${functionalCurrency}`);
    }

    const carryingValue = Number(balance.foreign_balance || 0);
    const closingValue = carryingValue * Number(rate.rate || 0);
    const gainLoss = closingValue - carryingValue;

    if (Math.abs(gainLoss) > 0.005) {
      revaluations.push({
        ...balance,
        carrying_value: carryingValue,
        closing_value: closingValue,
        closing_rate: Number(rate.rate),
        gain_loss: gainLoss,
      });
    }
  }

  if (!revaluations.length) {
    return recordPeriodCloseStep({
      ...input,
      stepType: "FX_REVALUATION",
      status: "SKIPPED",
      evidence: {
        reason: "Configured foreign-currency balances produced no material revaluation movement",
      },
    });
  }

  const net = revaluations.reduce((sum, row) => sum + row.gain_loss, 0);
  const rule = await getPostingRule({
    organizationId: context.organizationId,
    entityId: context.entityId,
    eventType: "FX_REVALUATION",
  });
  const amount = Math.abs(net);
  const gain = net > 0;
  const journalLines = [
    {
      account_id: gain ? rule.debit_account_id : rule.credit_account_id,
      debit: gain ? amount : 0,
      credit: gain ? 0 : amount,
      description: "Foreign-currency balance revaluation",
    },
    {
      account_id: gain ? rule.credit_account_id : rule.debit_account_id,
      debit: gain ? 0 : amount,
      credit: gain ? amount : 0,
      description: gain ? "Unrealised FX gain" : "Unrealised FX loss",
    },
  ];

  const { data, error } = await supabaseAdmin.rpc(
    "finance_run_fx_revaluation_atomic",
    {
      p_organization_id: context.organizationId,
      p_entity_id: context.entityId,
      p_period_id: context.periodId,
      p_revaluations: revaluations,
      p_currency_code: functionalCurrency,
      p_journal_lines: journalLines,
      p_created_by: uuidOrNull(input.completedBy),
      p_idempotency_key: required(input.idempotencyKey, "idempotencyKey"),
    }
  );

  if (error) throw new Error(`FX revaluation failed: ${error.message}`);
  return data;
}

async function runTaxClose(input) {
  const context = await loadPeriodCloseContext(input);
  const taxType = String(input.taxType || "INDIRECT_TAX").trim().toUpperCase();
  const { data: config, error } = await supabaseAdmin
    .from("finance_tax_close_configurations")
    .select("*")
    .eq("organization_id", context.organizationId)
    .or(`entity_id.eq.${context.entityId},entity_id.is.null`)
    .eq("tax_type", taxType)
    .eq("status", "ACTIVE")
    .order("entity_id", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!config) {
    return recordPeriodCloseStep({
      ...input,
      stepType: "TAX_CLOSE",
      status: "SKIPPED",
      evidence: {
        reason: `No active ${taxType} close configuration exists for the selected entity`,
        tax_type: taxType,
      },
    });
  }

  const { rows } = await loadLedgerAccountBalances({
    organizationId: context.organizationId,
    entityId: context.entityId,
    startDate: context.period.start_date,
    endDate: context.period.end_date,
  });
  const byId = new Map(rows.map(row => [row.account_id, row]));
  const recoverable = Number(byId.get(config.recoverable_tax_account_id)?.amount || 0);
  const payable = Number(byId.get(config.payable_tax_account_id)?.amount || 0);
  const net = payable - recoverable;

  if (Math.abs(net) <= 0.005) {
    return recordPeriodCloseStep({
      ...input,
      stepType: "TAX_CLOSE",
      status: "SKIPPED",
      evidence: {
        reason: "No net tax settlement movement exists for the selected period",
        tax_type: taxType,
        recoverable_tax: recoverable,
        payable_tax: payable,
      },
    });
  }

  const journalLines = [];
  if (recoverable > 0) {
    journalLines.push({
      account_id: config.settlement_account_id,
      debit: recoverable,
      credit: 0,
      description: `${taxType} recoverable transfer`,
    });
    journalLines.push({
      account_id: config.recoverable_tax_account_id,
      debit: 0,
      credit: recoverable,
      description: `${taxType} recoverable close`,
    });
  }
  if (payable > 0) {
    journalLines.push({
      account_id: config.payable_tax_account_id,
      debit: payable,
      credit: 0,
      description: `${taxType} payable close`,
    });
    journalLines.push({
      account_id: config.settlement_account_id,
      debit: 0,
      credit: payable,
      description: `${taxType} settlement transfer`,
    });
  }

  return postPeriodAdjustment({
    ...input,
    stepType: "TAX_CLOSE",
    sourceId: randomUUID(),
    description: `${taxType} period close`,
    amount: Math.abs(net),
    eventType: "VAT_CLOSE",
    evidence: {
      tax_type: taxType,
      recoverable_tax: recoverable,
      payable_tax: payable,
      net_tax: net,
      journal_lines: journalLines,
    },
    currencyCode: context.currencyCode,
    exchangeRate: 1,
    journalLines,
  });
}

async function runRetainedEarnings(input) {
  const context = await loadPeriodCloseContext(input);
  const { rows } = await loadLedgerAccountBalances({
    organizationId: context.organizationId,
    entityId: context.entityId,
    startDate: context.period.start_date,
    endDate: context.period.end_date,
  });
  const revenue = rows
    .filter(row => row.classification === "revenue")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const expenses = rows
    .filter(row => ["expense", "cogs"].includes(row.classification))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const netIncome = revenue - expenses;

  if (Math.abs(netIncome) <= 0.005) {
    return recordPeriodCloseStep({
      ...input,
      stepType: "RETAINED_EARNINGS",
      status: "SKIPPED",
      evidence: {
        reason: "The selected fiscal period has no material net income or loss to close",
        revenue,
        expenses,
        net_income: netIncome,
      },
    });
  }

  return postPeriodAdjustment({
    ...input,
    stepType: "RETAINED_EARNINGS",
    sourceId: randomUUID(),
    description: "Transfer current-period result to retained earnings",
    amount: Math.abs(netIncome),
    eventType: "YEAR_END_CLOSE",
    evidence: {
      revenue,
      expenses,
      net_income: netIncome,
    },
    currencyCode: context.currencyCode,
    exchangeRate: 1,
  });
}

async function runBankReconciliation(input) {
  const context = await loadPeriodCloseContext(input);
  const { data, error } = await supabaseAdmin.rpc(
    "finance_reconcile_bank_period_atomic",
    {
      p_organization_id: context.organizationId,
      p_entity_id: context.entityId,
      p_period_id: context.periodId,
      p_completed_by: uuidOrNull(input.completedBy),
      p_idempotency_key: required(input.idempotencyKey, "idempotencyKey"),
    }
  );

  if (error) throw new Error(`Bank reconciliation failed: ${error.message}`);
  return data;
}

async function runSubledgerReconciliation(input) {
  const context = await loadPeriodCloseContext(input);
  const tolerance = Number(input.tolerance ?? 0.01);
  const { data, error } = await supabaseAdmin.rpc(
    "finance_reconcile_subledgers_period_atomic",
    {
      p_organization_id: context.organizationId,
      p_entity_id: context.entityId,
      p_period_id: context.periodId,
      p_tolerance: tolerance,
      p_completed_by: uuidOrNull(input.completedBy),
      p_idempotency_key: required(input.idempotencyKey, "idempotencyKey"),
    }
  );

  if (error) throw new Error(`Subledger reconciliation failed: ${error.message}`);
  return data;
}

export async function runPeriodCloseStep(input = {}) {
  const step = required(input.stepType || input.step_type, "stepType").toUpperCase();
  const normalized = {
    ...input,
    organizationId: input.organizationId || input.organization_id,
    entityId: input.entityId || input.entity_id,
    periodId: input.periodId || input.period_id,
    completedBy: input.completedBy || input.completed_by || null,
    idempotencyKey: input.idempotencyKey || input.idempotency_key,
  };

  switch (step) {
    case "DEPRECIATION":
      return runDepreciation(normalized);
    case "FX_REVALUATION":
      return runFXRevaluation(normalized);
    case "TAX_CLOSE":
      return runTaxClose(normalized);
    case "RETAINED_EARNINGS":
      return runRetainedEarnings(normalized);
    case "BANK_RECONCILIATION":
      return runBankReconciliation(normalized);
    case "SUBLEDGER_RECONCILIATION":
      return runSubledgerReconciliation(normalized);
    default:
      throw new Error(`Unsupported period close step: ${step}`);
  }
}

export async function loadPeriodCloseChecklist({
  organizationId,
  entityId,
  periodId,
}) {
  const context = await loadPeriodCloseContext({ organizationId, entityId, periodId });
  const { data: steps, error } = await supabaseAdmin
    .from("finance_period_close_steps")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("entity_id", context.entityId)
    .eq("period_id", context.periodId)
    .order("completed_at", { ascending: true });

  if (error) throw error;

  return {
    success: true,
    period: context.period,
    currency_code: context.currencyCode,
    required_steps: [
      "SUBLEDGER_RECONCILIATION",
      "BANK_RECONCILIATION",
      "DEPRECIATION",
      "FX_REVALUATION",
      "TAX_CLOSE",
    ],
    year_end_steps: ["RETAINED_EARNINGS"],
    steps: steps || [],
  };
}
