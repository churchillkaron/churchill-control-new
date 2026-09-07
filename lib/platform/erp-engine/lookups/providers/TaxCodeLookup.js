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

    return rows
      .filter(row => row.is_active !== false)
      .map(row => ({
        value: row.id,
        label: row.tax_name || row.tax_code,
        code: row.tax_code || "",
        description:
          row.tax_rate === null || row.tax_rate === undefined
            ? ""
            : formatRate(row.tax_rate),
        raw: row,
      }));
  }
}

export default new TaxCodeLookup();
