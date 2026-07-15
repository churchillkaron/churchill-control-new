import BaseLookupProvider
from "../BaseLookupProvider";

import {
  listPaymentTerms,
}
from "@/lib/finance/payment-terms/repositories/paymentTermRepository";

class PaymentTermsLookup
extends BaseLookupProvider {

  async getOptions({

    context,

  }) {

    const rows =
      await listPaymentTerms({

        organization_id:
          context.organizationId,

      });

    return rows.map(
      row => ({

        value:
          row.id,

        label:
          row.name,

        description:
          row.description || "",

        raw:
          row,

      })
    );

  }

}

export default new PaymentTermsLookup();
