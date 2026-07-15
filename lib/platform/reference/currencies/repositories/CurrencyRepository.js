import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const CurrencyRepository = {
  async list({ organizationId = null } = {}) {
    let query = supabaseAdmin
      .from("currencies")
      .select("*")
      .order("code", { ascending: true });

    if (organizationId) {
      query = query.or(
        `organization_id.eq.${organizationId},organization_id.is.null`
      );
    }

    const { data, error } = await query;

    if (error) throw error;

    return data || [];
  },

  async get({ organizationId = null, currencyId }) {
    if (!currencyId) throw new Error("currencyId required");

    let query = supabaseAdmin
      .from("currencies")
      .select("*")
      .eq("id", currencyId);

    if (organizationId) {
      query = query.or(
        `organization_id.eq.${organizationId},organization_id.is.null`
      );
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw error;

    return data || null;
  },
};
