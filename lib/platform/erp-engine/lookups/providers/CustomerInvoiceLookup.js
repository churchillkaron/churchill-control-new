import BaseLookupProvider from "../BaseLookupProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

class CustomerInvoiceLookup extends BaseLookupProvider {
  async getOptions({ context } = {}) {
    if (!context?.organizationId) throw new Error("organizationId required");
    if (!context?.entityId) return [];
    const { data: rows, error } = await supabaseAdmin
      .from("customer_invoices")
      .select("id,party_id,invoice_number,invoice_date,due_date,status,total_amount,outstanding_balance,currency_code")
      .eq("organization_id", context.organizationId)
      .eq("entity_id", context.entityId)
      .order("invoice_date", { ascending: false })
      .limit(500);
    if (error) throw error;
    const partyIds = [...new Set((rows || []).map((row) => row.party_id).filter(Boolean))];
    let parties = [];
    if (partyIds.length) {
      const result = await supabaseAdmin.from("parties").select("id,display_name,legal_name").in("id", partyIds);
      if (result.error) throw result.error;
      parties = result.data || [];
    }
    const partyById = new Map(parties.map((row) => [String(row.id), row]));
    return (rows || []).map((row) => {
      const party = partyById.get(String(row.party_id || ""));
      const customer = party?.display_name || party?.legal_name || "Customer";
      const total = Number(row.total_amount || 0);
      return {
        value: row.id,
        label: `${row.invoice_number || row.id} · ${customer}`,
        description: [
          row.invoice_date ? `Issued ${row.invoice_date}` : null,
          `${total.toLocaleString("en-GB", { maximumFractionDigits: 2 })}${row.currency_code ? ` ${row.currency_code}` : ""}`,
          row.status,
        ].filter(Boolean).join(" · "),
        raw: row,
      };
    });
  }
}

export default new CustomerInvoiceLookup();
