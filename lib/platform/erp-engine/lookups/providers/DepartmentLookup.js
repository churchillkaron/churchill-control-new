import BaseLookupProvider from "../BaseLookupProvider";
import { getDepartments } from "@/lib/platform/administration/departments/repositories/DepartmentRepository";

class DepartmentLookup extends BaseLookupProvider {
  async getOptions({ context }) {
    const rows = await getDepartments({
      organizationId: context.organizationId,
      entityId: context.entityId,
    });

    return rows.map((row) => ({
      value: row.id,
      label: row.name,
      description: row.description || row.code || "",
      raw: row,
    }));
  }
}

export default new DepartmentLookup();
