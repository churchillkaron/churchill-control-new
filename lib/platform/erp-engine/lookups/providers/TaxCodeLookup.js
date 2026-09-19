import BaseLookupProvider from "../BaseLookupProvider";
import { TaxCodeRepository } from "@/lib/finance/tax-codes/repositories/taxCodeRepository";

function formatRate(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate)) return "";

  const percentage = Math.abs(rate) <= 1 ? rate * 100 : rate;
  return `${Number(percentage.toFixed(4))}%`;
}

class TaxCodeLookup extends BaseLookupProvider {
  async getOptions({ context }) {
    const rows = await TaxCodeRepository.list({
      organizationId: context.organizationId,
    });

    const unique = new Map();
    for (const row of rows.filter(row => row.is_active !== false)) {
      const key = [
        String(row.tax_code || "").trim().toUpperCase(),
        String(row.tax_name || "").trim().toUpperCase(),
        String(row.tax_type || "").trim().toUpperCase(),
        Number(row.tax_rate ?? 0),
        String(row.tax_regime || "").trim().toUpperCase(),
        String(row.accounting_standard || "").trim().toUpperCase(),
        String(row.effective_from || ""),
        String(row.effective_to || ""),
      ].join("|");
      const current = unique.get(key);
      if (!current || (!current.organization_id && row.organization_id)) unique.set(key, row);
    }

    return [...unique.values()].map(row => ({
      value: row.id,
      label: row.tax_name || row.tax_code,
      code: row.tax_code || "",
      description: [
        row.tax_rate === null || row.tax_rate === undefined ? "" : formatRate(row.tax_rate),
        row.tax_regime || "",
        row.accounting_standard || "",
      ].filter(Boolean).join(" · "),
      raw: row,
    }));
  }
}

export default new TaxCodeLookup();
