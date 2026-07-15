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

    return rows.map(
      row => ({

        value:
          row.id,

        label:
          row.account_name,

        description:
          row.bank_name || "",

        raw:
          row,

      })
    );

  }

}

export default new BankAccountLookup();
