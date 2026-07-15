import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function requireOrganizationId(organizationId) {
  if (!organizationId) throw new Error("organizationId required");
}

export const TaxCodeRepository = {
  async list({ organizationId }) {
    requireOrganizationId(organizationId);

    const { data, error } = await supabaseAdmin
      .from("tax_rules")
      .select("*")
      .eq("organization_id", organizationId)
      .order("tax_name", { ascending: true });

    if (error) throw error;

    return data || [];
  },

  async get({ organizationId, taxCodeId }) {
    requireOrganizationId(organizationId);
    if (!taxCodeId) throw new Error("taxCodeId required");

    const { data, error } = await supabaseAdmin
      .from("tax_rules")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", taxCodeId)
      .maybeSingle();

    if (error) throw error;

    return data || null;
  },

  async upsert({ organizationId, values }) {
    requireOrganizationId(organizationId);

    const { data, error } = await supabaseAdmin
      .from("tax_rules")
      .upsert({
        id: values.id || undefined,
        organization_id: organizationId,
        tax_code: values.code,
        tax_name: values.name,
        tax_rate: values.rate,
        tax_regime: values.regime,
        accounting_standard: values.standard,
        effective_from: values.effective_from || null,
        effective_to: values.effective_to || null,
        is_active: values.is_active ?? true,
      })
      .select()
      .single();

    if (error) throw error;

    return data;
  },
};

export async function upsertTaxCode({
  organization_id,
  values,
}) {
  return TaxCodeRepository.upsert({
    organizationId: organization_id,
    values,
  });
}
