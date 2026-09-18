import BaseLookupProvider from "../BaseLookupProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

class LegalEntityLookup extends BaseLookupProvider {
  async getOptions({ context } = {}) {
    if (!context?.organizationId) throw new Error("organizationId required");
    const { data, error } = await supabaseAdmin
      .from("legal_entities")
      .select("id,code,legal_name,display_name,country,currency,is_active,is_default_accounting_entity")
      .eq("organization_id", context.organizationId)
      .eq("is_active", true)
      .order("is_default_accounting_entity", { ascending: false })
      .order("legal_name", { ascending: true });
    if (error) throw error;
    return (data || []).map((row) => ({
      value: row.id,
      label: row.code ? `${row.code} - ${row.display_name || row.legal_name}` : (row.display_name || row.legal_name),
      description: [row.country, row.currency, row.is_default_accounting_entity ? "Default accounting entity" : null].filter(Boolean).join(" · "),
      raw: row,
    }));
  }
}

export default new LegalEntityLookup();
