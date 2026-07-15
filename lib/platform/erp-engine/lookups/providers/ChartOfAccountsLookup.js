import BaseLookupProvider
from "../BaseLookupProvider";

import {
  AccountRepository,
}
from "@/lib/finance/chart-of-accounts/repositories/AccountRepository";

class ChartOfAccountsLookup
extends BaseLookupProvider {

  async getOptions({

    context,

  }) {

    const rows =
      await AccountRepository.list({

        organizationId:
          context.organizationId,

        entityId:
          context.entityId,

      });

    return rows.map(
      account => ({

        value:
          account.id,

        label:

          `${account.account_code} - ${account.account_name}`,

        code:
          account.account_code,

        description:
          account.account_name,

        raw:
          account,

      })
    );

  }

}

export default new ChartOfAccountsLookup();
