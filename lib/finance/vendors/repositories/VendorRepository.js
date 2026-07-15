import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function requireOrganizationId(organizationId) {
  if (!organizationId) throw new Error("organizationId required");
}

export const VendorRepository = {
  async list({ organizationId }) {
    requireOrganizationId(organizationId);

    const { data, error } = await supabaseAdmin
      .from("supplier_profiles")
      .select(`
        *,
        parties (
          id,
          legal_name,
          display_name,
          email,
          phone,
          tax_id
        )
      `)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return data || [];
  },

  async get({ organizationId, vendorId }) {
    requireOrganizationId(organizationId);
    if (!vendorId) throw new Error("vendorId required");

    const { data, error } = await supabaseAdmin
      .from("supplier_profiles")
      .select(`
        *,
        parties (
          id,
          legal_name,
          display_name,
          email,
          phone,
          tax_id
        )
      `)
      .eq("organization_id", organizationId)
      .eq("id", vendorId)
      .maybeSingle();

    if (error) throw error;

    return data || null;
  },
};
