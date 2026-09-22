import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "organization_payment_config";

function clean(value) {
  return String(value ?? "").trim();
}

export const PaymentConfigurationRepository = {
  async list({ organizationId }) {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("organization_id", organizationId)
      .eq("enabled", true);

    if (error) throw error;
    return data || [];
  },

  async resolve({
    organizationId,
    paymentMethod,
    country = null,
    currency = null,
  }) {
    const rows = await this.list({ organizationId });
    const method = clean(paymentMethod).toLowerCase();
    const requestedCountry = clean(country).toUpperCase();
    const requestedCurrency = clean(currency).toUpperCase();

    const candidates = rows.filter((row) => {
      if (clean(row.payment_method).toLowerCase() !== method) return false;
      if (
        requestedCountry &&
        row.country &&
        clean(row.country).toUpperCase() !== requestedCountry
      ) {
        return false;
      }
      if (
        requestedCurrency &&
        row.currency &&
        clean(row.currency).toUpperCase() !== requestedCurrency
      ) {
        return false;
      }
      return true;
    });

    return candidates[0] || null;
  },
};
