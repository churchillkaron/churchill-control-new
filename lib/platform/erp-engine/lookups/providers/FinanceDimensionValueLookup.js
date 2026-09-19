import BaseLookupProvider from "../BaseLookupProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

class FinanceDimensionValueLookup extends BaseLookupProvider {
  async getOptions({ context } = {}) {
    if (!context?.organizationId) throw new Error("organizationId required");
    let query = supabaseAdmin
      .from("finance_dimension_values")
      .select("id,dimension_id,entity_id,code,name,description,is_active")
      .eq("organization_id", context.organizationId)
      .eq("is_active", true)
      .order("code", { ascending: true });
    if (context.dimensionId) query = query.eq("dimension_id", context.dimensionId);
    if (context.entityId) query = query.or(`entity_id.eq.${context.entityId},entity_id.is.null`);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((row) => ({
      value: row.id,
      label: row.code ? `${row.code} - ${row.name}` : row.name,
      description: row.description || "",
      raw: row,
    }));
  }
}

export default new FinanceDimensionValueLookup();
