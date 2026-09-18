import BaseLookupProvider
from "../BaseLookupProvider";

import {
  listBankAccounts,
}
from "@/lib/finance/bank-accounts/repositories/bankAccountRepository";

class BankAccountLookup
extends BaseLookupProvider {

  async getOptions({

    context,

  }) {

    const rows =
      await listBankAccounts({

        organization_id:
          context.organizationId,

      });

    return rows
      .filter(row => row.active !== false && row.is_active !== false)
      .filter(row => !context.entityId || String(row.entity_id || "") === String(context.entityId))
      .map(
      row => ({

        value:
          row.id,

        label:
          row.account_name,

        description: [row.bank_name, row.account_number, row.currency_code || row.currency].filter(Boolean).join(" · "),

        raw:
          row,

      })
    );

  }

}

export default new BankAccountLookup();
