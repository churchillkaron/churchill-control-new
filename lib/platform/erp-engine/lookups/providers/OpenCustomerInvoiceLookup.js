import BaseLookupProvider from "../BaseLookupProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const upper = (v) => String(v || "").trim().toUpperCase();

class OpenCustomerInvoiceLookup extends BaseLookupProvider {
  async getOptions({ context } = {}) {
    if (!context?.organizationId) throw new Error("organizationId required");
    if (!context?.entityId) return [];
    const { data: rows, error } = await supabaseAdmin
      .from("customer_invoices")
      .select("id,party_id,invoice_number,due_date,status,outstanding_balance,total_amount,currency_code")
      .eq("organization_id", context.organizationId)
      .eq("entity_id", context.entityId)
      .order("due_date", { ascending: true });
    if (error) throw error;
    const openRows = (rows || []).filter((row) => {
      const status = upper(row.status);
      const outstanding = Number(row.outstanding_balance ?? row.total_amount ?? 0);
      return outstanding > 0 && !["PAID", "CANCELLED", "CANCELED", "REVERSED", "VOID", "VOIDED"].includes(status);
    });
    const partyIds = [...new Set(openRows.map((row) => row.party_id).filter(Boolean))];
    let parties = [];
    if (partyIds.length) {
      const result = await supabaseAdmin.from("parties").select("id,display_name,legal_name").in("id", partyIds);
      if (result.error) throw result.error;
      parties = result.data || [];
    }
    const partyById = new Map(parties.map((row) => [String(row.id), row]));
    return openRows.map((row) => {
      const party = partyById.get(String(row.party_id || ""));
      const customer = party?.display_name || party?.legal_name || "Customer";
      const outstanding = Number(row.outstanding_balance ?? row.total_amount ?? 0);
      return {
        value: row.id,
        label: `${row.invoice_number || row.id} · ${customer}`,
        description: [
          `Outstanding ${outstanding.toLocaleString("en-GB", { maximumFractionDigits: 2 })}${row.currency_code ? ` ${row.currency_code}` : ""}`,
          row.due_date ? `Due ${row.due_date}` : null,
        ].filter(Boolean).join(" · "),
        raw: row,
      };
    });
  }
}

export default new OpenCustomerInvoiceLookup();
