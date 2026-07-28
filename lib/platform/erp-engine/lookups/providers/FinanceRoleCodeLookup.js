import BaseLookupProvider from "../BaseLookupProvider";
import {
  listFinanceRoles,
} from "@/lib/finance/security/repositories/FinancePermissionRepository";

class FinanceRoleCodeLookup extends BaseLookupProvider {
  async getOptions({ context } = {}) {
    const organizationId = context?.organizationId;

    if (!organizationId) {
      throw new Error("organizationId required");
    }

    const rows = await listFinanceRoles(organizationId);

    return rows.map((row) => ({
      value: row.role_code,
      label: row.role_name || row.role_code,
      description: row.description || row.role_code,
      raw: row,
    }));
  }
}

export default new FinanceRoleCodeLookup();
