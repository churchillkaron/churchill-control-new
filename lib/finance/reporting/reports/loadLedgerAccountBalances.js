import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { AccountRepository } from "@/lib/finance/chart-of-accounts/repositories/AccountRepository";

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function includesAny(value, terms) {
  return terms.some(term => value.includes(term));
}

export function classifyStatementAccount(account = {}) {
  const classification = normalize([
    account.account_category,
    account.account_type,
    account.account_class,
    account.subtype,
  ].filter(Boolean).join(" "));

  if (includesAny(classification, ["cash", "bank", "cash equivalent"])) {
    return "cash";
  }

  if (includesAny(classification, [
    "cost of goods",
    "cost of sales",
    "cogs",
    "direct cost",
  ])) {
    return "cogs";
  }

  if (includesAny(classification, ["revenue", "income", "sales"])) {
    return "revenue";
  }

  if (includesAny(classification, [
    "expense",
    "operating cost",
    "overhead",
    "depreciation",
    "amortisation",
    "amortization",
  ])) {
    return "expense";
  }

  if (classification.includes("asset")) {
    return "asset";
  }

  if (classification.includes("liability")) {
    return "liability";
  }

  if (includesAny(classification, ["equity", "capital", "retained earnings"])) {
    return "equity";
  }

  return "unclassified";
}

function presentationAmount(classification, debit, credit, normalBalance) {
  if (["revenue", "liability", "equity"].includes(classification)) {
    return credit - debit;
  }

  if (["asset", "cash", "cogs", "expense"].includes(classification)) {
    return debit - credit;
  }

  return normalize(normalBalance).includes("credit")
    ? credit - debit
    : debit - credit;
}

async function loadAccounts({ organizationId, accountIds }) {
  if (!accountIds.length) {
    return new Map();
  }

  const accounts = await AccountRepository.list({
    organizationId,
    entityId: null,
  });

  const wanted = new Set(accountIds);

  return new Map(
    (accounts || [])
      .filter(account => wanted.has(account.id))
      .map(account => [account.id, account])
  );
}

export async function loadLedgerAccountBalances({
  organizationId,
  entityId,
  startDate = null,
  endDate = null,
} = {}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!entityId) {
    throw new Error("entityId required");
  }

  let query = supabaseAdmin
    .from("general_ledger")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId);

  if (startDate) {
    query = query.gte("posting_date", startDate);
  }

  if (endDate) {
    query = query.lte("posting_date", endDate);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const sourceLines = Array.isArray(data) ? data : [];
  const accountIds = [...new Set(sourceLines.map(line => line.account_id).filter(Boolean))];
  const accounts = await loadAccounts({ organizationId, accountIds });
  const balances = new Map();
  const ledgerLines = [];

  for (const line of sourceLines) {
    const account = accounts.get(line.account_id) || null;
    const accountId = account?.id || line.account_id;

    if (!accountId) {
      continue;
    }

    const classification = classifyStatementAccount(account || {});
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);

    ledgerLines.push({
      ...line,
      account,
      classification,
      debit,
      credit,
    });

    if (!balances.has(accountId)) {
      balances.set(accountId, {
        account_id: accountId,
        account_code: account?.account_code || "",
        account_name: account?.account_name || "Unknown Account",
        account_category: account?.account_category || "",
        account_type: account?.account_type || "",
        normal_balance: account?.normal_balance || "",
        classification,
        total_debits: 0,
        total_credits: 0,
        net_movement: 0,
        amount: 0,
      });
    }

    const balance = balances.get(accountId);
    balance.total_debits += debit;
    balance.total_credits += credit;
    balance.net_movement += debit - credit;
    balance.amount = presentationAmount(
      balance.classification,
      balance.total_debits,
      balance.total_credits,
      balance.normal_balance
    );
  }

  const rows = [...balances.values()].sort((left, right) =>
    String(left.account_code || "").localeCompare(String(right.account_code || ""))
  );

  return {
    rows,
    ledgerLines,
    startDate,
    endDate,
  };
}
