import BaseLookupProvider from "../BaseLookupProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

class AccountsPayableLookup extends BaseLookupProvider {
  async getOptions({ context }) {
    if (!context?.organizationId) {
      throw new Error("organizationId required");
    }

    if (!context?.entityId) {
      throw new Error("entityId required for accounts payable lookup");
    }

    const { data, error } = await supabaseAdmin
      .from("accounts_payable")
      .select("id, vendor_party_id, supplier_party_id, invoice_number, due_date, amount, outstanding_balance, currency_code, status")
      .eq("organization_id", context.organizationId)
      .eq("entity_id", context.entityId)
      .gt("outstanding_balance", 0)
      .neq("status", "PAID")
      .order("due_date", { ascending: true })
      .limit(250);

    if (error) {
      throw new Error(`Unable to load accounts payable lookup: ${error.message}`);
    }

    return (data || []).map(row => ({
      value: row.id,
      label: row.invoice_number || `Payable ${row.id}`,
      description: [
        row.due_date ? `Due ${row.due_date}` : null,
        row.outstanding_balance !== null && row.outstanding_balance !== undefined
          ? `${row.outstanding_balance} ${row.currency_code || ""}`.trim()
          : null,
        row.status || null,
      ].filter(Boolean).join(" · "),
      raw: row,
    }));
  }
}

export default new AccountsPayableLookup();
