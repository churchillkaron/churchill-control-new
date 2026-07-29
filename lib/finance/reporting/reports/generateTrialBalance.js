import {
  loadLedgerAccountBalances,
} from "./loadLedgerAccountBalances";

function roundAmount(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
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

  const { rows } = await loadLedgerAccountBalances({
    organizationId,
    entityId,
    startDate,
    endDate,
  });

  const reportRows = rows.map(row => {
    const periodDebits = roundAmount(row.total_debits);
    const periodCredits = roundAmount(row.total_credits);
    const netBalance = roundAmount(periodDebits - periodCredits);

    return {
      account_id: row.account_id,
      account_code: row.account_code,
      account_name: row.account_name,
      account_category: row.account_category,
      account_type: row.account_type,
      normal_balance: row.normal_balance,
      period_debits: periodDebits,
      period_credits: periodCredits,
      debit_balance: netBalance > 0 ? netBalance : 0,
      credit_balance: netBalance < 0 ? Math.abs(netBalance) : 0,
      balance: netBalance,
    };
  });

  const totalActivityDebits = roundAmount(
    reportRows.reduce((sum, row) => sum + row.period_debits, 0)
  );
  const totalActivityCredits = roundAmount(
    reportRows.reduce((sum, row) => sum + row.period_credits, 0)
  );
  const totalDebits = roundAmount(
    reportRows.reduce((sum, row) => sum + row.debit_balance, 0)
  );
  const totalCredits = roundAmount(
    reportRows.reduce((sum, row) => sum + row.credit_balance, 0)
  );
  const difference = roundAmount(totalDebits - totalCredits);

  return {
    success: true,
    organizationId,
    entityId,
    periodId,
    startDate,
    endDate,
    rows: reportRows,
    accountCount: reportRows.length,
    totalActivityDebits,
    totalActivityCredits,
    totalDebits,
    totalCredits,
    difference,
    balanced: Math.abs(difference) < 0.01,
  };
}
