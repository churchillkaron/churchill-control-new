import BaseLookupProvider from "../BaseLookupProvider";
import {
  listFinancePermissions,
} from "@/lib/finance/security/repositories/FinancePermissionRepository";

const CORE_FINANCE_PERMISSIONS = [
  "finance.view",
  "finance.accounting.view",
  "finance.accounting.manage",
  "finance.journals.create",
  "finance.journals.post",
  "finance.journals.reverse",
  "finance.receivables.view",
  "finance.receivables.manage",
  "finance.payables.view",
  "finance.payables.manage",
  "finance.banking.view",
  "finance.banking.manage",
  "finance.tax.view",
  "finance.tax.manage",
  "finance.reports.view",
  "finance.reports.manage",
  "finance.close.execute",
  "finance.configuration.manage",
  "finance.permissions.view",
  "finance.permissions.grant",
];

class FinancePermissionLookup extends BaseLookupProvider {
  async getOptions({ context } = {}) {
    const organizationId = context?.organizationId;

    if (!organizationId) {
      throw new Error("organizationId required");
    }

    const rows = await listFinancePermissions(organizationId);
    const existingByKey = new Map(
      rows
        .filter((row) => row?.permission_key)
        .map((row) => [row.permission_key, row])
    );
    const keys = [
      ...new Set([
        ...CORE_FINANCE_PERMISSIONS,
        ...existingByKey.keys(),
      ]),
    ].sort();

    return keys.map((permissionKey) => {
      const row = existingByKey.get(permissionKey) || null;

      return {
        value: permissionKey,
        label: permissionKey,
        description: row?.role_id
          ? "Already granted to at least one Finance role"
          : "Available Finance permission",
        raw: row || { permission_key: permissionKey },
      };
    });
  }
}

export default new FinancePermissionLookup();
