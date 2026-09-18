import BaseLookupProvider from "../BaseLookupProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

class FiscalPeriodLookup extends BaseLookupProvider {
  async getOptions({ context } = {}) {
    if (!context?.organizationId) throw new Error("organizationId required");
    if (!context?.entityId) return [];
    const { data, error } = await supabaseAdmin
      .from("accounting_periods")
      .select("id,period_name,name,start_date,end_date,status,fiscal_year,fiscal_month")
      .eq("organization_id", context.organizationId)
      .eq("entity_id", context.entityId)
      .order("start_date", { ascending: false });
    if (error) throw error;
    return (data || []).map((row) => ({
      value: row.id,
      label: row.period_name || row.name || `${row.start_date} — ${row.end_date}`,
      description: [`${row.start_date} — ${row.end_date}`, row.status].filter(Boolean).join(" · "),
      raw: row,
    }));
  }
}

export default new FiscalPeriodLookup();
