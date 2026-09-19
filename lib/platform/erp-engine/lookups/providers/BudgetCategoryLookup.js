import BaseLookupProvider from "../BaseLookupProvider";
import { AccountRepository } from "@/lib/finance/chart-of-accounts/repositories/AccountRepository";

class BudgetCategoryLookup extends BaseLookupProvider {
  async getOptions({ context } = {}) {
    if (!context?.organizationId) throw new Error("organizationId required");
    if (!context?.entityId) return [];
    const rows = await AccountRepository.list({
      organizationId: context.organizationId,
      entityId: context.entityId,
    });
    return (rows || [])
      .filter((row) => row.is_active !== false && row.posting_allowed !== false)
      .map((row) => ({
        value: row.account_code,
        label: `${row.account_code} - ${row.account_name}`,
        description: [row.account_category, row.account_type].filter(Boolean).join(" · "),
        raw: row,
      }));
  }
}

export default new BudgetCategoryLookup();
