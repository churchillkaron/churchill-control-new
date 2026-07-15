import BaseLookupProvider
from "../BaseLookupProvider";

import {
  getBusinessUnits,
}
from "@/lib/platform/administration/business-units/repositories/BusinessUnitRepository";

class BusinessUnitLookup
extends BaseLookupProvider {

  async getOptions({

    context,

  }) {

    const rows =
      await getBusinessUnits(
        context.organizationId
      );

    return rows.map(
      row => ({

        value:
          row.id,

        label:
          row.name,

        raw:
          row,

      })
    );

  }

}

export default new BusinessUnitLookup();
