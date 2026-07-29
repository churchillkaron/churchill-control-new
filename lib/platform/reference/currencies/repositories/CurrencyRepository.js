import { listFinanceCurrencies } from "@/lib/finance/currencies/FinanceCurrencyPolicy";

export const CurrencyRepository = {
  async list({ organizationId = null, includeInactive = false } = {}) {
    if (!organizationId) return [];

    return listFinanceCurrencies({
      organizationId,
      includeInactive,
    });
  },

  async get({ organizationId = null, currencyId }) {
    if (!organizationId) throw new Error("organizationId required");
    if (!currencyId) throw new Error("currencyId required");

    const rows = await listFinanceCurrencies({
      organizationId,
      includeInactive: true,
    });

    const key = String(currencyId).trim().toUpperCase();

    return (
      rows.find(
        (row) =>
          String(row.id) === String(currencyId) ||
          String(row.code || "").toUpperCase() === key
      ) || null
    );
  },
};
