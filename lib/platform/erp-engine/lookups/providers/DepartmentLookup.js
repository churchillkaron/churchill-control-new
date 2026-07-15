import BaseLookupProvider
from "../BaseLookupProvider";

import {
  getDepartments,
}
from "@/lib/platform/administration/departments/repositories/DepartmentRepository";

class DepartmentLookup
extends BaseLookupProvider {

  async getOptions({

    context,

  }) {

    const rows =
      await getDepartments(
        context.organizationId
      );

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

export default new DepartmentLookup();
