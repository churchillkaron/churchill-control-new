import {
  loadLedgerAccountBalances,
} from "./loadLedgerAccountBalances";

function roundAmount(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function rowMap(rows = []) {
  return new Map((rows || []).map(row => [row.account_id, row]));
}

export default async function generateTrialBalance(input = {}) {
  const organizationId =
    input.organizationId ||
    input.organization_id ||
    null;
  const entityId =
    input.entityId ||
    input.entity_id ||
    null;
  const periodId =
    input.periodId ||
    input.period_id ||
    null;
  const startDate = input.startDate || null;
  const endDate = input.endDate || null;
  const currency = input.currency || input.currencyCode || null;

  const [closingResult, periodResult] = await Promise.all([
    loadLedgerAccountBalances({
      organizationId,
      entityId,
      startDate: null,
      endDate,
    }),
    loadLedgerAccountBalances({
      organizationId,
      entityId,
      startDate,
      endDate,
    }),
  ]);

  const closingRows = rowMap(closingResult.rows);
  const periodRows = rowMap(periodResult.rows);
  const accountIds = new Set([
    ...closingRows.keys(),
    ...periodRows.keys(),
  ]);

  const reportRows = [...accountIds]
    .map(accountId => {
      const closing = closingRows.get(accountId) || {};
      const period = periodRows.get(accountId) || {};
      const source = Object.keys(closing).length ? closing : period;

      const closingNet = roundAmount(closing.net_movement);
      const periodDebits = roundAmount(period.total_debits);
      const periodCredits = roundAmount(period.total_credits);
      const periodNet = roundAmount(periodDebits - periodCredits);
      const openingNet = roundAmount(closingNet - periodNet);

      return {
        account_id: accountId,
        account_code: source.account_code || "",
        account_name: source.account_name || "Unknown Account",
        account_category: source.account_category || "",
        account_type: source.account_type || "",
        normal_balance: source.normal_balance || "",
        opening_debit: openingNet > 0 ? openingNet : 0,
        opening_credit: openingNet < 0 ? Math.abs(openingNet) : 0,
        period_debits: periodDebits,
        period_credits: periodCredits,
        closing_debit: closingNet > 0 ? closingNet : 0,
        closing_credit: closingNet < 0 ? Math.abs(closingNet) : 0,
        balance: closingNet,
      };
    })
    .filter(row =>
      Math.abs(row.opening_debit) >= 0.01 ||
      Math.abs(row.opening_credit) >= 0.01 ||
      Math.abs(row.period_debits) >= 0.01 ||
      Math.abs(row.period_credits) >= 0.01 ||
      Math.abs(row.closing_debit) >= 0.01 ||
      Math.abs(row.closing_credit) >= 0.01
    )
    .sort((left, right) =>
      String(left.account_code || "").localeCompare(String(right.account_code || ""))
    );

  const totals = reportRows.reduce(
    (result, row) => ({
      openingDebits: result.openingDebits + row.opening_debit,
      openingCredits: result.openingCredits + row.opening_credit,
      periodDebits: result.periodDebits + row.period_debits,
      periodCredits: result.periodCredits + row.period_credits,
      closingDebits: result.closingDebits + row.closing_debit,
      closingCredits: result.closingCredits + row.closing_credit,
    }),
    {
      openingDebits: 0,
      openingCredits: 0,
      periodDebits: 0,
      periodCredits: 0,
      closingDebits: 0,
      closingCredits: 0,
    }
  );

  const totalOpeningDebits = roundAmount(totals.openingDebits);
  const totalOpeningCredits = roundAmount(totals.openingCredits);
  const totalActivityDebits = roundAmount(totals.periodDebits);
  const totalActivityCredits = roundAmount(totals.periodCredits);
  const totalDebits = roundAmount(totals.closingDebits);
  const totalCredits = roundAmount(totals.closingCredits);
  const difference = roundAmount(totalDebits - totalCredits);

  return {
    success: true,
    organizationId,
    entityId,
    periodId,
    currency,
    startDate,
    endDate,
    rows: reportRows,
    accountCount: reportRows.length,
    totalOpeningDebits,
    totalOpeningCredits,
    totalActivityDebits,
    totalActivityCredits,
    totalDebits,
    totalCredits,
    difference,
    balanced: Math.abs(difference) < 0.01,
  };
}
