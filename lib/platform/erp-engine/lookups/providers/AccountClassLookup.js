import BaseLookupProvider from "../BaseLookupProvider";
import { AccountRepository } from "@/lib/finance/chart-of-accounts/repositories/AccountRepository";

const upper = (value) => String(value || "").trim().toUpperCase();

export function createAccountClassLookup({ types = [], categories = [] } = {}) {
  const allowedTypes = new Set(types.map(upper));
  const allowedCategories = new Set(categories.map(upper));
  return new class AccountClassLookup extends BaseLookupProvider {
    async getOptions({ context } = {}) {
      if (!context?.organizationId) throw new Error("organizationId required");
      if (!context?.entityId) return [];
      const rows = await AccountRepository.list({ organizationId: context.organizationId, entityId: context.entityId });
      return (rows || [])
        .filter((row) => row.is_active !== false && row.posting_allowed !== false)
        .filter((row) => allowedTypes.has(upper(row.account_type)) || allowedCategories.has(upper(row.account_category)))
        .map((row) => ({
          value: row.id,
          label: `${row.account_code} - ${row.account_name}`,
          description: [row.account_category, row.account_type].filter(Boolean).join(" · "),
          raw: row,
        }));
    }
  }();
}
