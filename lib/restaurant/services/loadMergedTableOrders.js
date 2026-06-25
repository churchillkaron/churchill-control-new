import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function loadMergedTableOrders({
  organizationId,
  tableNumber = null,
  tableId = null,
}) {
  if (!organizationId || (!tableNumber && !tableId)) {
    return [];
  }

  let mergeQuery = supabaseAdmin
    .from("restaurant_table_merges")
    .select("merged_table_id")
    .eq("organization_id", organizationId);

  if (tableId) {
    mergeQuery = mergeQuery.eq("master_table_id", tableId);
  } else {
    mergeQuery = mergeQuery.eq("master_table_id", tableNumber);
  }

  const { data: merges } = await mergeQuery;

  const childTables = (merges || []).map(
    (merge) => merge.merged_table_id
  );

  const allTables = [tableId || tableNumber, ...childTables];

  let orderQuery = supabaseAdmin
    .from("orders")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "OPEN");

  if (tableId) {
    orderQuery = orderQuery.in("table_id", allTables);
  } else {
    orderQuery = orderQuery.in("table_number", allTables);
  }

  const { data: orders } = await orderQuery;

  return orders || [];
}
