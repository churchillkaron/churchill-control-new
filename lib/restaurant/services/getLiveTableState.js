import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getMergedTableGroup } from "./getMergedTableGroup";

export async function getLiveTableState({
  organizationId,
  tableNumber = null,
  tableId = null,
}) {
  if (!organizationId || (!tableNumber && !tableId)) {
    return {
      tables: [],
      orders: [],
      merged: false,
    };
  }

  const group = await getMergedTableGroup({
    organizationId,
    tableNumber,
    tableId,
  });

  let tableQuery = supabaseAdmin
    .from("restaurant_tables")
    .select("*")
    .eq("organization_id", organizationId);

  if (tableId) {
    tableQuery = tableQuery.in("id", group);
  } else {
    tableQuery = tableQuery.in("table_number", group);
  }

  const { data: tables } = await tableQuery;

  let orderQuery = supabaseAdmin
    .from("orders")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "OPEN");

  if (tableId) {
    orderQuery = orderQuery.in("table_id", group);
  } else {
    orderQuery = orderQuery.in("table_number", group);
  }

  const { data: orders } = await orderQuery;

  return {
    tables: tables || [],
    orders: orders || [],
    merged: group.length > 1,
  };
}
