import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getMergedTableGroup({
  organizationId,
  tableNumber = null,
  tableId = null,
}) {
  if (!organizationId || (!tableNumber && !tableId)) {
    return [];
  }

  let query = supabaseAdmin
    .from("restaurant_table_merges")
    .select("merged_table_id")
    .eq("organization_id", organizationId);

  if (tableId) {
    query = query.eq("master_table_id", tableId);
  } else {
    query = query.eq("master_table_id", tableNumber);
  }

  const { data: merges } = await query;

  const childTables = (merges || []).map(
    (merge) => merge.merged_table_id
  );

  return [tableId || tableNumber, ...childTables];
}
