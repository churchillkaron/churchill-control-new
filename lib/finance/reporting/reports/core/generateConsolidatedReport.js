import { loadLedgerAccountBalances } from "@/lib/finance/reporting/reports/loadLedgerAccountBalances";

function addAccount(target, row, entity) {
  const key = String(row.account_code || row.account_id || "");

  if (!target.has(key)) {
    target.set(key, {
      accountId: row.account_id,
      code: row.account_code,
      name: row.account_name,
      category: row.account_category,
      type: row.account_type,
      classification: row.classification,
      debit: 0,
      credit: 0,
      balance: 0,
      amount: 0,
      entities: [],
    });
  }

  const account = target.get(key);
  const debit = Number(row.total_debits || 0);
  const credit = Number(row.total_credits || 0);
  const amount = Number(row.amount || 0);

  account.debit += debit;
  account.credit += credit;
  account.balance += debit - credit;
  account.amount += amount;
  account.entities.push({
    entityId: entity.id,
    entityName: entity.display_name || entity.legal_name || entity.id,
    debit,
    credit,
    amount,
  });
}

export async function generateConsolidatedReport({
  organizationId,
  entities,
  startDate,
  endDate,
  currency = null,
} = {}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!Array.isArray(entities) || !entities.length) {
    throw new Error("entities required");
  }

  const grouped = new Map();
  const entityReports = [];

  for (const entity of entities) {
    const ledger = await loadLedgerAccountBalances({
      organizationId,
      entityId: entity.id,
      startDate,
      endDate,
    });

    for (const row of ledger.rows) {
      addAccount(grouped, row, entity);
    }

    entityReports.push({
      entityId: entity.id,
      entityName: entity.display_name || entity.legal_name || entity.id,
      currency: entity.currency || null,
      accountCount: ledger.rows.length,
    });
  }

  const accounts = [...grouped.values()]
    .sort((left, right) =>
      String(left.code || "").localeCompare(String(right.code || ""))
    );

  const sum = classification =>
    accounts
      .filter(account => account.classification === classification)
      .reduce((total, account) => total + Number(account.amount || 0), 0);

  const assets = sum("asset") + sum("cash");
  const liabilities = sum("liability");
  const equityBeforeCurrentEarnings = sum("equity");
  const revenue = sum("revenue");
  const cogs = sum("cogs");
  const expenses = sum("expense");
  const netProfit = revenue - cogs - expenses;
  const equity = equityBeforeCurrentEarnings + netProfit;

  return {
    organizationId,
    entityIds: entities.map(entity => entity.id),
    entities: entityReports,
    startDate,
    endDate,
    currency,
    accounts,
    balanceSheet: {
      assets,
      liabilities,
      equity,
      equityBeforeCurrentEarnings,
      currentEarnings: netProfit,
      balanced: Math.abs(assets - (liabilities + equity)) < 0.01,
    },
    profitLoss: {
      revenue,
      cogs,
      grossProfit: revenue - cogs,
      expenses,
      netProfit,
    },
  };
}
