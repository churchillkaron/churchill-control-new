import { supabase } from "@/lib/supabase";

export async function getAccountingKPIs({ tenantId }) {
  const [
    invoices,
    apInvoices,
    journalEntries,
    bankTransactions,
  ] = await Promise.all([
    supabase
      .from("ar_invoices")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId),

    supabase
      .from("ap_invoices")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId),

    supabase
      .from("journal_entries")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId),

    supabase
      .from("bank_transactions")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
  ]);

  return {
    arInvoices: invoices.count || 0,
    apInvoices: apInvoices.count || 0,
    journalEntries: journalEntries.count || 0,
    bankTransactions: bankTransactions.count || 0,
  };
}
