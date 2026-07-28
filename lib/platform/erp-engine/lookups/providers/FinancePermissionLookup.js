import BaseLookupProvider from "../BaseLookupProvider";
import {
  listFinancePermissions,
} from "@/lib/finance/security/repositories/FinancePermissionRepository";

class FinancePermissionLookup extends BaseLookupProvider {
  async getOptions({ context } = {}) {
    const organizationId = context?.organizationId;

    if (!organizationId) {
      throw new Error("organizationId required");
    }

    const rows = await listFinancePermissions(organizationId);

    return rows.map((row) => ({
      value: row.permission_key,
      label: row.permission_key,
      description: row.role_id ? "Already granted to a Finance role" : "Available Finance permission",
      raw: row,
    }));
  }
}

export default new FinancePermissionLookup();
