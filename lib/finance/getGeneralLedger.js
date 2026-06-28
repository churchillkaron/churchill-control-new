import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getGeneralLedger({
  organizationId,
  entityId,
  startDate,
  endDate,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!entityId) {
    throw new Error("entityId required");
  }

  let query = supabaseAdmin
    .from("general_ledger")
    .select(`
      *,
      chart_of_accounts!fk_general_ledger_account (
        id,
        code,
        name,
        category,
        subcategory,
        normal_balance
      )
    `)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId);

  if (startDate) {
    query = query.gte("posting_date", startDate);
  }

  if (endDate) {
    query = query.lte("posting_date", endDate);
  }

  const { data, error } = await query.order("posting_date", {
    ascending: true,
  });

  if (error) {
    throw error;
  }

  return data || [];
}
