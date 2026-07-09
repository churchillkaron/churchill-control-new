import upsertBankAccountCapability
from "../capabilities/upsertBankAccount";

import {
  listBankAccounts,
  upsertBankAccount,
  archiveBankAccount,
} from "../repositories/bankAccountRepository";

export async function upsertBankAccountCommand(input) {
  return await upsertBankAccountCapability(input);
}

export async function listBankAccountsCommand(input) {
  return await listBankAccounts(input);
}

export async function importBankAccountsCommand(input) {
  const { rows, organization_id } = input;

  let imported = 0;

  for (const row of rows || []) {
    await upsertBankAccount({
      organization_id,
      values: row,
    });
    imported++;
  }

  return {
    success: true,
    imported,
  };
}

export async function exportBankAccountsCommand(input) {
  const rows = await listBankAccounts(input);

  return {
    success: true,
    rows,
  };
}

export async function analyzeBankAccountsCommand(input) {
  const rows = await listBankAccounts(input);

  return {
    success: true,
    summary: {
      accounts: rows.length,
      currencies: [...new Set(rows.map(r => r.currency_code).filter(Boolean))],
      active: rows.filter(r => r.active !== false).length,
      inactive: rows.filter(r => r.active === false).length,
    }
  };
}
