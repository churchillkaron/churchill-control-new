import BaseLookupProvider from "../BaseLookupProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const upper = (v) => String(v || "").trim().toUpperCase();

class AccountsPayableLookup extends BaseLookupProvider {
  async getOptions({ context } = {}) {
    if (!context?.organizationId) throw new Error("organizationId required");
    if (!context?.entityId) return [];
    const { data: rows, error } = await supabaseAdmin
      .from("accounts_payable")
      .select("id,vendor_party_id,invoice_number,due_date,status,outstanding_balance,amount,currency_code,payment_hold,hold_reason")
      .eq("organization_id", context.organizationId)
      .eq("entity_id", context.entityId)
      .order("due_date", { ascending: true });
    if (error) throw error;
    const openRows = (rows || []).filter((row) => {
      const status = upper(row.status);
      const outstanding = Number(row.outstanding_balance ?? row.amount ?? 0);
      return outstanding > 0 && row.payment_hold !== true && !["PAID", "CANCELLED", "CANCELED", "REVERSED", "VOID", "VOIDED"].includes(status);
    });
    const partyIds = [...new Set(openRows.map((row) => row.vendor_party_id).filter(Boolean))];
    let parties = [];
    if (partyIds.length) {
      const result = await supabaseAdmin.from("parties").select("id,display_name,legal_name").in("id", partyIds);
      if (result.error) throw result.error;
      parties = result.data || [];
    }
    const partyById = new Map(parties.map((row) => [String(row.id), row]));
    return openRows.map((row) => {
      const party = partyById.get(String(row.vendor_party_id || ""));
      const vendor = party?.display_name || party?.legal_name || "Vendor";
      const outstanding = Number(row.outstanding_balance ?? row.amount ?? 0);
      return {
        value: row.id,
        label: `${row.invoice_number || row.id} · ${vendor}`,
        description: [
          `Outstanding ${outstanding.toLocaleString("en-GB", { maximumFractionDigits: 2 })}${row.currency_code ? ` ${row.currency_code}` : ""}`,
          row.due_date ? `Due ${row.due_date}` : null,
          row.payment_hold ? `ON HOLD${row.hold_reason ? `: ${row.hold_reason}` : ""}` : null,
        ].filter(Boolean).join(" · "),
        raw: row,
      };
    });
  }
}

export default new AccountsPayableLookup();
