import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveFinanceExchangeRate } from "@/lib/finance/currencies/FinanceExchangeRateResolver";

const ELIGIBLE_ACCOUNT_TYPES = new Set(["ASSET", "CURRENT_ASSET", "CASH", "LIABILITY"]);

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function signed(row) {
  return Number(row?.debit || 0) - Number(row?.credit || 0);
}

export function normalizeFxAccountIds(value) {
  if (!Array.isArray(value)) throw new Error("FX Revaluation Accounts are invalid");
  const ids = value
    .map(item => text(item?.account_id || item))
    .filter(Boolean);
  if (!ids.length) throw new Error("FX Revaluation requires at least one monetary Account");
  return [...new Set(ids)];
}

async function loadPriorAdjustmentMap({
  organizationId,
  entityId,
  currencyCode,
  revaluationDate,
  selectedAccountIds,
  excludeRunId = null,
}) {
  let priorQuery = supabaseAdmin
    .from("finance_fx_revaluation_runs")
    .select("id,journal_entry_id,revaluation_date")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("currency_code", currencyCode)
    .eq("status", "COMPLETED")
    .lte("revaluation_date", revaluationDate)
    .not("journal_entry_id", "is", null);

  if (excludeRunId) priorQuery = priorQuery.neq("id", excludeRunId);

  const { data: priorRuns, error: runError } = await priorQuery;
  if (runError) throw runError;

  const journalIds = [...new Set((priorRuns || []).map(row => row.journal_entry_id).filter(Boolean))];
  if (!journalIds.length) return { adjustments: new Map(), priorRuns: priorRuns || [] };

  const { data: rows, error } = await supabaseAdmin
    .from("general_ledger")
    .select("account_id,debit,credit,journal_entry_id")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .in("journal_entry_id", journalIds)
    .in("account_id", selectedAccountIds);
  if (error) throw error;

  const adjustments = new Map();
  for (const row of rows || []) {
    const id = text(row.account_id);
    adjustments.set(id, (adjustments.get(id) || 0) + signed(row));
  }

  return { adjustments, priorRuns: priorRuns || [] };
}

async function loadRateEvidence({ organizationId, rate }) {
  if (!rate?.rate_id) {
    return {
      configured_source: rate?.source || null,
      rate_type: null,
      rate_effective_date: rate?.effective_date || null,
      orientation: rate?.source || null,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("finance_exchange_rates")
    .select("id,base_currency,quote_currency,from_currency,to_currency,rate,effective_date,source,rate_type,status,entity_id")
    .eq("organization_id", organizationId)
    .eq("id", rate.rate_id)
    .maybeSingle();
  if (error) throw error;

  return {
    configured_source: data?.source || rate?.source || null,
    rate_type: data?.rate_type || null,
    rate_effective_date: data?.effective_date || rate?.effective_date || null,
    orientation: rate?.source || null,
    configured_rate: data ? Number(data.rate) : null,
    configured_base_currency: data?.base_currency || data?.from_currency || null,
    configured_quote_currency: data?.quote_currency || data?.to_currency || null,
  };
}

export async function buildFxRevaluationPlan({
  organizationId,
  entityId,
  revaluationDate,
  currencyCode,
  accountIds,
  excludeRunId = null,
}) {
  if (!organizationId) throw new Error("organization_id required");
  if (!entityId) throw new Error("entity_id required");

  const selectedAccountIds = normalizeFxAccountIds(accountIds);
  const resolvedDate = text(revaluationDate).slice(0, 10);
  const resolvedCurrency = upper(currencyCode);
  if (!resolvedDate) throw new Error("revaluation_date required");
  if (!resolvedCurrency) throw new Error("currency_code required");

  const [{ data: accounts, error: accountError }, rate] = await Promise.all([
    supabaseAdmin
      .from("chart_of_accounts")
      .select("id,account_code,account_name,account_category,account_type,normal_balance,currency_code,is_active")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .in("id", selectedAccountIds),
    resolveFinanceExchangeRate({
      organizationId,
      entityId,
      transactionCurrency: resolvedCurrency,
      effectiveDate: resolvedDate,
    }),
  ]);

  if (accountError) throw accountError;
  if ((accounts || []).length !== selectedAccountIds.length) {
    throw new Error("FX Revaluation Account is outside selected Legal Entity or unavailable");
  }

  for (const account of accounts || []) {
    if (account.is_active === false || !ELIGIBLE_ACCOUNT_TYPES.has(upper(account.account_type))) {
      throw new Error("FX Revaluation Account is inactive or not a monetary balance-sheet type");
    }
  }

  if (rate.transaction_currency === rate.functional_currency) {
    throw new Error("FX Revaluation Currency must differ from functional currency");
  }

  const [{ adjustments: priorAdjustments, priorRuns }, { data: foreignRows, error: foreignError }, rateEvidence] = await Promise.all([
    loadPriorAdjustmentMap({
      organizationId,
      entityId,
      currencyCode: resolvedCurrency,
      revaluationDate: resolvedDate,
      selectedAccountIds,
      excludeRunId,
    }),
    supabaseAdmin
      .from("general_ledger")
      .select("id,account_id,debit,credit,exchange_rate,posting_date,transaction_date,reference_type,reference_id,description")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("currency_code", resolvedCurrency)
      .lte("posting_date", resolvedDate)
      .in("account_id", selectedAccountIds),
    loadRateEvidence({ organizationId, rate }),
  ]);

  if (foreignError) throw foreignError;

  const accountMap = new Map((accounts || []).map(account => [text(account.id), account]));
  const positions = new Map();

  for (const accountId of selectedAccountIds) {
    positions.set(accountId, {
      foreign_balance: 0,
      historical_carrying_base: 0,
      prior_adjustment: priorAdjustments.get(accountId) || 0,
      source_row_count: 0,
      missing_historical_rate_count: 0,
      min_historical_rate: null,
      max_historical_rate: null,
    });
  }

  for (const row of foreignRows || []) {
    const id = text(row.account_id);
    const position = positions.get(id);
    if (!position) continue;

    const amount = signed(row);
    position.foreign_balance += amount;
    position.source_row_count += 1;

    const historicalRate = Number(row.exchange_rate);
    if (!Number.isFinite(historicalRate) || historicalRate <= 0) {
      position.missing_historical_rate_count += 1;
      continue;
    }

    position.historical_carrying_base += amount * historicalRate;
    position.min_historical_rate = position.min_historical_rate === null
      ? historicalRate
      : Math.min(position.min_historical_rate, historicalRate);
    position.max_historical_rate = position.max_historical_rate === null
      ? historicalRate
      : Math.max(position.max_historical_rate, historicalRate);
  }

  let totalGain = 0;
  let totalLoss = 0;
  let totalAdjustment = 0;
  let blockingRows = 0;

  const accountAdjustments = selectedAccountIds.map(accountId => {
    const account = accountMap.get(accountId);
    const position = positions.get(accountId);
    const blocked = position.missing_historical_rate_count > 0;
    const carryingBase = position.historical_carrying_base + position.prior_adjustment;
    const closingValue = position.foreign_balance * Number(rate.exchange_rate);
    const difference = blocked ? null : roundMoney(closingValue - carryingBase);

    if (blocked) {
      blockingRows += 1;
    } else if (Math.abs(difference) >= 0.005) {
      totalAdjustment += Math.abs(difference);
      if (difference > 0) totalGain += difference;
      else totalLoss += Math.abs(difference);
    }

    return {
      account_id: accountId,
      account_code: account?.account_code || null,
      account_name: account?.account_name || null,
      account_type: account?.account_type || null,
      account_currency: account?.currency_code || null,
      foreign_balance: roundMoney(position.foreign_balance),
      historical_carrying_base: roundMoney(position.historical_carrying_base),
      prior_adjustment: roundMoney(position.prior_adjustment),
      carrying_base: roundMoney(carryingBase),
      closing_value: roundMoney(closingValue),
      adjustment: difference,
      adjustment_side: difference === null
        ? "BLOCKED"
        : difference > 0.004
          ? "DEBIT"
          : difference < -0.004
            ? "CREDIT"
            : "NONE",
      source_row_count: position.source_row_count,
      missing_historical_rate_count: position.missing_historical_rate_count,
      min_historical_rate: position.min_historical_rate,
      max_historical_rate: position.max_historical_rate,
      blocked,
      blocking_reason: blocked ? "Historical exchange rate missing on one or more foreign-currency ledger rows" : null,
    };
  });

  const adjustmentLines = accountAdjustments
    .filter(row => row.adjustment !== null && Math.abs(row.adjustment) >= 0.005)
    .map(row => row.adjustment > 0
      ? {
          account_id: row.account_id,
          description: `FX revaluation ${resolvedCurrency} at ${rate.exchange_rate}`,
          debit: row.adjustment,
          credit: 0,
        }
      : {
          account_id: row.account_id,
          description: `FX revaluation ${resolvedCurrency} at ${rate.exchange_rate}`,
          debit: 0,
          credit: Math.abs(row.adjustment),
        });

  return {
    organization_id: organizationId,
    entity_id: entityId,
    revaluation_date: resolvedDate,
    currency_code: resolvedCurrency,
    functional_currency: rate.functional_currency,
    rate: {
      exchange_rate: Number(rate.exchange_rate),
      requested_effective_date: rate.effective_date,
      rate_id: rate.rate_id || null,
      resolver_source: rate.source,
      ...rateEvidence,
    },
    selected_account_ids: selectedAccountIds,
    account_adjustments: accountAdjustments,
    adjustment_lines: adjustmentLines,
    total_gain: roundMoney(totalGain),
    total_loss: roundMoney(totalLoss),
    total_adjustment: roundMoney(totalAdjustment),
    adjustment_count: adjustmentLines.length,
    blocking_account_count: blockingRows,
    can_post: blockingRows === 0,
    same_or_prior_date_completed_run_count: priorRuns.length,
    methodology: {
      carrying_value: "Foreign-currency ledger balance translated at each ledger row's historical exchange rate, plus all completed prior FX revaluation adjustments through the revaluation date.",
      closing_value: "Foreign-currency balance translated at the governed closing rate resolved for the revaluation date.",
      duplicate_guard: "Completed prior FX revaluation journals on the same date are included in carrying value so repeated runs cannot repost the same adjustment.",
      missing_rate_guard: "Rows without a valid historical exchange rate block posting instead of silently defaulting to 1.0.",
    },
  };
}
