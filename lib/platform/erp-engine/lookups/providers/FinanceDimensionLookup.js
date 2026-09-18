import BaseLookupProvider from "../BaseLookupProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

class FinanceDimensionLookup extends BaseLookupProvider {
  async getOptions({ context } = {}) {
    if (!context?.organizationId) throw new Error("organizationId required");
    let query = supabaseAdmin
      .from("finance_dimensions")
      .select("id,entity_id,code,name,description,scope,value_type,is_active")
      .eq("organization_id", context.organizationId)
      .eq("is_active", true)
      .order("code", { ascending: true });
    if (context.entityId) query = query.or(`entity_id.eq.${context.entityId},entity_id.is.null`);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((row) => ({
      value: row.id,
      label: row.code ? `${row.code} - ${row.name}` : row.name,
      description: [row.scope, row.value_type, row.description].filter(Boolean).join(" · "),
      raw: row,
    }));
  }
}

export default new FinanceDimensionLookup();
