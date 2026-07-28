import BaseLookupProvider from "../BaseLookupProvider";
import {
  listFinanceRoles,
} from "@/lib/finance/security/repositories/FinancePermissionRepository";

class FinanceRoleLookup extends BaseLookupProvider {
  async getOptions({ context } = {}) {
    const organizationId = context?.organizationId;

    if (!organizationId) {
      throw new Error("organizationId required");
    }

    const rows = await listFinanceRoles(organizationId);

    return rows.map((row) => ({
      value: row.id,
      label: row.role_name || row.role_code || row.id,
      description: [row.role_code, row.description]
        .filter(Boolean)
        .join(" · "),
      raw: row,
    }));
  }
}

export default new FinanceRoleLookup();
