import {
  loadLedgerAccountBalances,
} from "./loadLedgerAccountBalances";

export default async function generateTrialBalance(input = {}) {
  const organizationId =
    input.organizationId ||
    input.organization_id ||
    null;
  const entityId =
    input.entityId ||
    input.entity_id ||
    null;
  const startDate = input.startDate || null;
  const endDate = input.endDate || null;

  const { rows } = await loadLedgerAccountBalances({
    organizationId,
    entityId,
    startDate,
    endDate,
  });

  const totalDebits = rows.reduce(
    (sum, row) => sum + Number(row.total_debits || 0),
    0
  );
  const totalCredits = rows.reduce(
    (sum, row) => sum + Number(row.total_credits || 0),
    0
  );

  return {
    success: true,
    organizationId,
    entityId,
    startDate,
    endDate,
    rows: rows.map(row => ({
      account_id: row.account_id,
      account_code: row.account_code,
      account_name: row.account_name,
      account_category: row.account_category,
      account_type: row.account_type,
      normal_balance: row.normal_balance,
      total_debits: row.total_debits,
      total_credits: row.total_credits,
      balance: row.net_movement,
    })),
    totalDebits,
    totalCredits,
    balanced: Math.abs(totalDebits - totalCredits) < 0.01,
  };
}
