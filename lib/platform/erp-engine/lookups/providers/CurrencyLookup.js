import BaseLookupProvider from "../BaseLookupProvider";
import { CurrencyRepository } from "@/lib/platform/reference/currencies/repositories/CurrencyRepository";

class CurrencyLookup extends BaseLookupProvider {
  async getOptions({ context }) {
    const rows = await CurrencyRepository.list({
      organizationId: context.organizationId || null,
    });

    return rows.map(row => ({
      value: row.code || row.id,
      label: row.name
        ? `${row.code} - ${row.name}`
        : row.code || "Unnamed Currency",
      code: row.code || "",
      description: row.symbol || "",
      raw: row,
    }));
  }
}

export default new CurrencyLookup();
