import BaseLookupProvider from "../BaseLookupProvider";
import { AccountRepository } from "@/lib/finance/chart-of-accounts/repositories/AccountRepository";

const accountClass = (value) => String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
const upper = (value) => String(value || "").trim().toUpperCase();

export function createAccountClassLookup({ types = [], categories = [], nameIncludes = [], requireNameMatch = false } = {}) {
  const allowedTypes = new Set(types.map(accountClass));
  const allowedCategories = new Set(categories.map(accountClass));
  const allowedNameFragments = nameIncludes.map(upper).filter(Boolean);
  return new class AccountClassLookup extends BaseLookupProvider {
    async getOptions({ context } = {}) {
      if (!context?.organizationId) throw new Error("organizationId required");
      if (!context?.entityId) return [];
      const rows = await AccountRepository.list({ organizationId: context.organizationId, entityId: context.entityId });
      return (rows || [])
        .filter((row) => row.is_active !== false && row.posting_allowed !== false)
        .filter((row) => {
          const classMatch =
            allowedTypes.has(accountClass(row.account_type)) ||
            allowedCategories.has(accountClass(row.account_category));
          const nameMatch = allowedNameFragments.some((fragment) => upper(row.account_name).includes(fragment));
          return requireNameMatch ? classMatch && nameMatch : classMatch || nameMatch;
        })
        .map((row) => ({
          value: row.id,
          label: `${row.account_code} - ${row.account_name}`,
          description: [row.account_category, row.account_type].filter(Boolean).join(" · "),
          raw: row,
        }));
    }
  }();
}
