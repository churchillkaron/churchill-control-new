import BaseLookupProvider from "../BaseLookupProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const upper = (v) => String(v || "").trim().toUpperCase();

class AccountsPayableLookup extends BaseLookupProvider {
  async getOptions({ context } = {}) {
    if (!context?.organizationId) throw new Error("organizationId required");
    if (!context?.entityId) return [];
    const { data: rows, error } = await supabaseAdmin
      .from("accounts_payable")
      .select("id,vendor_party_id,vendor_invoice_id,due_date,status,outstanding_balance,amount,currency_code,payment_hold,hold_reason")
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
    const invoiceIds = [...new Set(openRows.map((row) => row.vendor_invoice_id).filter(Boolean))];
    const [partyResult, invoiceResult] = await Promise.all([
      partyIds.length
        ? supabaseAdmin.from("parties").select("id,display_name,legal_name").eq("organization_id", context.organizationId).in("id", partyIds)
        : Promise.resolve({ data: [], error: null }),
      invoiceIds.length
        ? supabaseAdmin.from("vendor_invoices").select("id,invoice_number,reference_number").eq("organization_id", context.organizationId).eq("entity_id", context.entityId).in("id", invoiceIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (partyResult.error) throw partyResult.error;
    if (invoiceResult.error) throw invoiceResult.error;
    const partyById = new Map((partyResult.data || []).map((row) => [String(row.id), row]));
    const invoiceById = new Map((invoiceResult.data || []).map((row) => [String(row.id), row]));
    return openRows.map((row) => {
      const party = partyById.get(String(row.vendor_party_id || ""));
      const invoice = invoiceById.get(String(row.vendor_invoice_id || ""));
      const vendor = party?.display_name || party?.legal_name || "Vendor";
      const invoiceNumber = invoice?.invoice_number || invoice?.reference_number || row.vendor_invoice_id || row.id;
      const outstanding = Number(row.outstanding_balance ?? row.amount ?? 0);
      return {
        value: row.id,
        label: `${invoiceNumber} · ${vendor}`,
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
