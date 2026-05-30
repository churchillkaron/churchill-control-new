import { supabase } from "@/lib/supabase";

export async function getGeneralLedger({
  tenantId,
  startDate,
  endDate,
}) {
  let query = supabase
    .from("journal_entry_lines")
    .select(`
      id,
      debit,
      credit,
      memo,
      created_at,
      chart_of_accounts (
        id,
        code,
        name,
        type
      ),
      journal_entries (
        id,
        entry_date,
        description,
        reference
      )
    `)
    .eq("tenant_id", tenantId);

  if (startDate) {
    query = query.gte("created_at", startDate);
  }

  if (endDate) {
    query = query.lte("created_at", endDate);
  }

  const { data, error } = await query.order("created_at", {
    ascending: true,
  });

  if (error) {
    throw error;
  }

  return data;
}
