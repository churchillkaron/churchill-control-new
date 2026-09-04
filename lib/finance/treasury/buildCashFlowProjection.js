import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PAGE_SIZE = 1000;
const VALID_GRAINS = new Set(["day", "week", "month"]);
const RECEIVABLE_EXCLUDED = new Set([
  "DRAFT",
  "CANCELLED",
  "CANCELED",
  "VOID",
  "PAID",
  "CREDITED",
  "POSTING_FAILED",
]);
const PAYABLE_EXCLUDED = new Set([
  "PAID",
  "CANCELLED",
  "CANCELED",
  "VOID",
  "REJECTED",
]);

function text(value) {
  return String(value ?? "").trim();
}

function numeric(value) {
  const resolved = Number(value);
  return Number.isFinite(resolved) ? resolved : 0;
}

function positiveInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function currency(value) {
  return text(value).toUpperCase() || "UNSPECIFIED";
}

function isoDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function addDays(dateText, days) {
  const parsed = new Date(`${dateText}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function monthEnd(dateText) {
  const parsed = new Date(`${dateText}T00:00:00.000Z`);
  parsed.setUTCMonth(parsed.getUTCMonth() + 1, 0);
  return parsed.toISOString().slice(0, 10);
}

function bucketStart(dateText, grain) {
  const parsed = new Date(`${dateText}T00:00:00.000Z`);
  if (grain === "month") {
    parsed.setUTCDate(1);
  } else if (grain === "week") {
    const mondayOffset = (parsed.getUTCDay() + 6) % 7;
    parsed.setUTCDate(parsed.getUTCDate() - mondayOffset);
  }
  return parsed.toISOString().slice(0, 10);
}

function bucketEnd(startDate, grain) {
  if (grain === "day") return startDate;
  if (grain === "week") return addDays(startDate, 6);
  return monthEnd(startDate);
}

function nextBucket(startDate, grain) {
  if (grain === "day") return addDays(startDate, 1);
  if (grain === "week") return addDays(startDate, 7);
  const parsed = new Date(`${startDate}T00:00:00.000Z`);
  parsed.setUTCMonth(parsed.getUTCMonth() + 1, 1);
  return parsed.toISOString().slice(0, 10);
}

function periodPhase(startDate, endDate, asOfDate) {
  if (endDate < asOfDate) return "HISTORICAL";
  if (startDate > asOfDate) return "FORECAST";
  return "CURRENT";
}

function scheduledDate(dueDate, asOfDate) {
  const due = isoDate(dueDate);
  if (!due) return null;
  return due < asOfDate ? asOfDate : due;
}

function signedMovement(row) {
  const amount = Math.abs(numeric(row?.amount));
  const direction = text(row?.direction).toUpperCase();
  if (["IN", "CREDIT", "RECEIPT", "DEPOSIT"].includes(direction)) {
    return { direction: "IN", amount, signed: amount };
  }
  if (["OUT", "DEBIT", "PAYMENT", "WITHDRAWAL"].includes(direction)) {
    return { direction: "OUT", amount, signed: -amount };
  }
  return null;
}

function accountLabel(account) {
  return account?.account_name || account?.bank_name || "Bank account";
}

function inCoverage(dateText, ranges) {
  return (ranges || []).some(range => dateText >= range.start && dateText <= range.end);
}

function pushPreview(target, entry, amount) {
  target.push({ ...entry, _rank: Math.abs(numeric(amount)) });
  target.sort((a, b) => b._rank - a._rank);
  if (target.length > 6) target.length = 6;
}

async function fetchPaged(buildQuery) {
  const rows = [];
  let offset = 0;

  while (true) {
    const { data, error } = await buildQuery(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

function buildEmptyPeriod({ currencyCode, startDate, grain, asOfDate }) {
  const endDate = bucketEnd(startDate, grain);
  return {
    id: `${currencyCode}:${startDate}`,
    currency_code: currencyCode,
    period_start: startDate,
    period_end: endDate,
    phase: periodPhase(startDate, endDate, asOfDate),
    actual_in: 0,
    actual_out: 0,
    actual_net: 0,
    scheduled_in: 0,
    scheduled_out: 0,
    scheduled_net: 0,
    actual_count: 0,
    scheduled_receipt_count: 0,
    scheduled_payment_count: 0,
    actual_sources: [],
    actual_preview: [],
    scheduled_receipts_preview: [],
    scheduled_payments_preview: [],
  };
}

function exceptionBucket(map, currencyCode) {
  const key = currency(currencyCode);
  if (!map.has(key)) {
    map.set(key, {
      currency_code: key,
      held_payables_count: 0,
      held_payables_amount: 0,
      unscheduled_payables_count: 0,
      unscheduled_payables_amount: 0,
      unscheduled_receivables_count: 0,
      unscheduled_receivables_amount: 0,
    });
  }
  return map.get(key);
}

export default async function buildCashFlowProjection({
  organizationId,
  entityId,
  asOfDate = null,
  historyDays = 28,
  horizonDays = 91,
  grain = "week",
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");

  const resolvedGrain = VALID_GRAINS.has(text(grain).toLowerCase())
    ? text(grain).toLowerCase()
    : "week";
  const resolvedHistoryDays = positiveInteger(historyDays, 28, 0, 365);
  const resolvedHorizonDays = positiveInteger(horizonDays, 91, 1, 730);
  const resolvedAsOfDate = isoDate(asOfDate) || new Date().toISOString().slice(0, 10);
  const historyStart = addDays(resolvedAsOfDate, -resolvedHistoryDays);
  const horizonEnd = addDays(resolvedAsOfDate, resolvedHorizonDays);

  const [
    bankAccountResult,
    statementImports,
    statementLines,
    ledgerRows,
    customerInvoices,
    payableRows,
  ] = await Promise.all([
    supabaseAdmin
      .from("bank_accounts")
      .select("id, bank_name, account_name, account_number, currency, currency_code, active")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("active", true)
      .order("account_name", { ascending: true }),
    fetchPaged((from, to) =>
      supabaseAdmin
        .from("finance_bank_statement_imports")
        .select("id, bank_account_id, statement_start_date, statement_end_date, currency_code")
        .eq("organization_id", organizationId)
        .eq("entity_id", entityId)
        .gte("statement_end_date", historyStart)
        .lte("statement_start_date", resolvedAsOfDate)
        .range(from, to)
    ),
    fetchPaged((from, to) =>
      supabaseAdmin
        .from("bank_statements")
        .select("id, bank_account_id, statement_import_id, statement_line_number, transaction_date, description, amount, direction, reference_number, matched, matched_at")
        .eq("organization_id", organizationId)
        .eq("entity_id", entityId)
        .gte("transaction_date", historyStart)
        .lte("transaction_date", resolvedAsOfDate)
        .range(from, to)
    ),
    fetchPaged((from, to) =>
      supabaseAdmin
        .from("bank_ledger")
        .select("id, bank_account_id, transaction_type, amount, direction, created_at, reconciled_statement_id, reconciled_at, currency_code, reference_number, source_document, source_document_id")
        .eq("organization_id", organizationId)
        .eq("entity_id", entityId)
        .gte("created_at", `${historyStart}T00:00:00.000Z`)
        .lte("created_at", `${resolvedAsOfDate}T23:59:59.999Z`)
        .order("created_at", { ascending: true })
        .range(from, to)
    ),
    fetchPaged((from, to) =>
      supabaseAdmin
        .from("customer_invoices")
        .select("id, invoice_number, due_date, outstanding_balance, outstanding_amount, total_amount, currency_code, status, party_id")
        .eq("organization_id", organizationId)
        .eq("entity_id", entityId)
        .range(from, to)
    ),
    fetchPaged((from, to) =>
      supabaseAdmin
        .from("accounts_payable")
        .select("id, vendor_party_id, vendor_invoice_id, due_date, outstanding_balance, amount, currency_code, status, payment_hold, hold_reason")
        .eq("organization_id", organizationId)
        .eq("entity_id", entityId)
        .range(from, to)
    ),
  ]);

  if (bankAccountResult.error) throw bankAccountResult.error;
  const bankAccounts = bankAccountResult.data || [];
  const accountMap = new Map(bankAccounts.map(account => [account.id, account]));
  const importMap = new Map(statementImports.map(statement => [statement.id, statement]));

  const coverageByAccount = new Map();
  for (const statement of statementImports) {
    if (!statement.bank_account_id) continue;
    if (!coverageByAccount.has(statement.bank_account_id)) {
      coverageByAccount.set(statement.bank_account_id, []);
    }
    coverageByAccount.get(statement.bank_account_id).push({
      start: statement.statement_start_date,
      end: statement.statement_end_date,
    });
  }

  const actualEntries = [];
  let ambiguousActualRows = 0;

  for (const row of statementLines) {
    const movement = signedMovement(row);
    if (!movement) {
      ambiguousActualRows += 1;
      continue;
    }
    const account = accountMap.get(row.bank_account_id) || null;
    const statement = importMap.get(row.statement_import_id) || null;
    actualEntries.push({
      id: row.id,
      source: "BANK_STATEMENT",
      date: row.transaction_date,
      currency_code: currency(account?.currency_code || account?.currency || statement?.currency_code),
      direction: movement.direction,
      amount: movement.amount,
      signed_amount: movement.signed,
      bank_account_id: row.bank_account_id || null,
      bank_account_name: accountLabel(account),
      reference_number: row.reference_number || null,
      description: row.description || null,
      reconciled: row.matched === true,
    });
  }

  for (const row of ledgerRows) {
    const rowDate = isoDate(row.created_at);
    if (!rowDate) continue;
    if (row.bank_account_id && inCoverage(rowDate, coverageByAccount.get(row.bank_account_id))) {
      continue;
    }
    const movement = signedMovement(row);
    if (!movement) {
      ambiguousActualRows += 1;
      continue;
    }
    const account = accountMap.get(row.bank_account_id) || null;
    actualEntries.push({
      id: row.id,
      source: "BANK_LEDGER",
      date: rowDate,
      currency_code: currency(row.currency_code || account?.currency_code || account?.currency),
      direction: movement.direction,
      amount: movement.amount,
      signed_amount: movement.signed,
      bank_account_id: row.bank_account_id || null,
      bank_account_name: accountLabel(account),
      reference_number: row.reference_number || null,
      description: row.source_document || row.transaction_type || null,
      reconciled: Boolean(row.reconciled_at || row.reconciled_statement_id),
    });
  }

  const scheduledReceipts = [];
  const scheduledPayments = [];
  const exceptionsByCurrency = new Map();

  for (const row of customerInvoices) {
    if (RECEIVABLE_EXCLUDED.has(text(row.status).toUpperCase())) continue;
    const outstandingAmount = numeric(
      row.outstanding_amount ?? row.outstanding_balance ?? row.total_amount
    );
    if (outstandingAmount <= 0) continue;
    const currencyCode = currency(row.currency_code);
    const effectiveDate = scheduledDate(row.due_date, resolvedAsOfDate);
    if (!effectiveDate) {
      const exception = exceptionBucket(exceptionsByCurrency, currencyCode);
      exception.unscheduled_receivables_count += 1;
      exception.unscheduled_receivables_amount += outstandingAmount;
      continue;
    }
    if (effectiveDate > horizonEnd) continue;
    scheduledReceipts.push({
      id: row.id,
      source: "ACCOUNTS_RECEIVABLE",
      date: effectiveDate,
      due_date: row.due_date || null,
      overdue: Boolean(row.due_date && row.due_date < resolvedAsOfDate),
      currency_code: currencyCode,
      amount: outstandingAmount,
      document_number: row.invoice_number || null,
      status: row.status || null,
      party_id: row.party_id || null,
    });
  }

  for (const row of payableRows) {
    if (PAYABLE_EXCLUDED.has(text(row.status).toUpperCase())) continue;
    const outstandingAmount = numeric(row.outstanding_balance ?? row.amount);
    if (outstandingAmount <= 0) continue;
    const currencyCode = currency(row.currency_code);
    const exception = exceptionBucket(exceptionsByCurrency, currencyCode);

    if (row.payment_hold === true) {
      exception.held_payables_count += 1;
      exception.held_payables_amount += outstandingAmount;
      continue;
    }

    const effectiveDate = scheduledDate(row.due_date, resolvedAsOfDate);
    if (!effectiveDate) {
      exception.unscheduled_payables_count += 1;
      exception.unscheduled_payables_amount += outstandingAmount;
      continue;
    }
    if (effectiveDate > horizonEnd) continue;
    scheduledPayments.push({
      id: row.id,
      source: "ACCOUNTS_PAYABLE",
      date: effectiveDate,
      due_date: row.due_date || null,
      overdue: Boolean(row.due_date && row.due_date < resolvedAsOfDate),
      currency_code: currencyCode,
      amount: outstandingAmount,
      document_number: row.vendor_invoice_id || null,
      status: row.status || null,
      party_id: row.vendor_party_id || null,
    });
  }

  const currencies = new Set(
    bankAccounts.map(account => currency(account.currency_code || account.currency))
  );
  actualEntries.forEach(entry => currencies.add(entry.currency_code));
  scheduledReceipts.forEach(entry => currencies.add(entry.currency_code));
  scheduledPayments.forEach(entry => currencies.add(entry.currency_code));
  exceptionsByCurrency.forEach((_, key) => currencies.add(key));

  const periods = new Map();
  const firstBucket = bucketStart(historyStart, resolvedGrain);
  const lastBucket = bucketStart(horizonEnd, resolvedGrain);

  for (const currencyCode of currencies) {
    let start = firstBucket;
    while (start <= lastBucket) {
      const period = buildEmptyPeriod({
        currencyCode,
        startDate: start,
        grain: resolvedGrain,
        asOfDate: resolvedAsOfDate,
      });
      periods.set(period.id, period);
      start = nextBucket(start, resolvedGrain);
    }
  }

  for (const entry of actualEntries) {
    const start = bucketStart(entry.date, resolvedGrain);
    const period = periods.get(`${entry.currency_code}:${start}`);
    if (!period) continue;
    if (entry.direction === "IN") period.actual_in += entry.amount;
    else period.actual_out += entry.amount;
    period.actual_net += entry.signed_amount;
    period.actual_count += 1;
    if (!period.actual_sources.includes(entry.source)) period.actual_sources.push(entry.source);
    pushPreview(period.actual_preview, {
      id: entry.id,
      source: entry.source,
      date: entry.date,
      direction: entry.direction,
      amount: entry.amount,
      bank_account_name: entry.bank_account_name,
      reference_number: entry.reference_number,
      description: entry.description,
      reconciled: entry.reconciled,
    }, entry.amount);
  }

  for (const entry of scheduledReceipts) {
    const start = bucketStart(entry.date, resolvedGrain);
    const period = periods.get(`${entry.currency_code}:${start}`);
    if (!period) continue;
    period.scheduled_in += entry.amount;
    period.scheduled_net += entry.amount;
    period.scheduled_receipt_count += 1;
    pushPreview(period.scheduled_receipts_preview, entry, entry.amount);
  }

  for (const entry of scheduledPayments) {
    const start = bucketStart(entry.date, resolvedGrain);
    const period = periods.get(`${entry.currency_code}:${start}`);
    if (!period) continue;
    period.scheduled_out += entry.amount;
    period.scheduled_net -= entry.amount;
    period.scheduled_payment_count += 1;
    pushPreview(period.scheduled_payments_preview, entry, entry.amount);
  }

  const rows = [...periods.values()]
    .sort((a, b) => {
      const currencyComparison = a.currency_code.localeCompare(b.currency_code);
      return currencyComparison || a.period_start.localeCompare(b.period_start);
    })
    .map(period => ({
      ...period,
      actual_preview: period.actual_preview.map(({ _rank, ...entry }) => entry),
      scheduled_receipts_preview: period.scheduled_receipts_preview.map(({ _rank, ...entry }) => entry),
      scheduled_payments_preview: period.scheduled_payments_preview.map(({ _rank, ...entry }) => entry),
    }));

  const currencySummary = [...currencies]
    .sort()
    .map(currencyCode => {
      const currencyRows = rows.filter(row => row.currency_code === currencyCode);
      return currencyRows.reduce(
        (summary, row) => {
          summary.actual_in += row.actual_in;
          summary.actual_out += row.actual_out;
          summary.actual_net += row.actual_net;
          summary.scheduled_in += row.scheduled_in;
          summary.scheduled_out += row.scheduled_out;
          summary.scheduled_net += row.scheduled_net;
          summary.actual_count += row.actual_count;
          summary.scheduled_receipt_count += row.scheduled_receipt_count;
          summary.scheduled_payment_count += row.scheduled_payment_count;
          return summary;
        },
        {
          currency_code: currencyCode,
          actual_in: 0,
          actual_out: 0,
          actual_net: 0,
          scheduled_in: 0,
          scheduled_out: 0,
          scheduled_net: 0,
          actual_count: 0,
          scheduled_receipt_count: 0,
          scheduled_payment_count: 0,
        }
      );
    });

  const statementAccountIds = new Set(statementLines.map(row => row.bank_account_id).filter(Boolean));
  const ledgerFallbackAccountIds = new Set(
    actualEntries
      .filter(entry => entry.source === "BANK_LEDGER")
      .map(entry => entry.bank_account_id)
      .filter(Boolean)
  );
  const accountEvidenceIds = new Set(
    actualEntries.map(entry => entry.bank_account_id).filter(Boolean)
  );

  return {
    as_of_date: resolvedAsOfDate,
    history_start: historyStart,
    horizon_end: horizonEnd,
    history_days: resolvedHistoryDays,
    horizon_days: resolvedHorizonDays,
    grain: resolvedGrain,
    currencies: [...currencies].sort(),
    rows,
    series: rows,
    currency_summary: currencySummary,
    exceptions: [...exceptionsByCurrency.values()].sort((a, b) =>
      a.currency_code.localeCompare(b.currency_code)
    ),
    evidence: {
      active_bank_accounts: bankAccounts.length,
      statement_backed_accounts: statementAccountIds.size,
      ledger_fallback_accounts: ledgerFallbackAccountIds.size,
      accounts_without_actual_activity: Math.max(0, bankAccounts.length - accountEvidenceIds.size),
      statement_actual_rows: actualEntries.filter(entry => entry.source === "BANK_STATEMENT").length,
      ledger_actual_rows: actualEntries.filter(entry => entry.source === "BANK_LEDGER").length,
      ambiguous_actual_rows: ambiguousActualRows,
    },
    methodology: {
      actuals:
        "Actual cash movement uses imported bank-statement lines where statement coverage exists. Bank-ledger activity is used only outside imported statement coverage to avoid double counting.",
      forecast:
        "Scheduled cash uses outstanding customer invoices and non-held accounts payable by due date. Overdue open items are treated as due as of the report date; items without a due date remain exceptions instead of being guessed into a period.",
      currency:
        "No FX conversion is applied; currencies remain separate throughout the cash-flow series.",
    },
  };
}
