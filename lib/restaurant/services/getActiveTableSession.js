import { getServiceSupabase } from "@/lib/shared/supabase/service";

export async function getActiveTableSession({
  organizationId = null,
  tableId = null,
  tableNumber = null,
}) {
  const supabase = getServiceSupabase();

  if (!organizationId) {
    throw new Error("organizationId required");
  }

  let query = supabase
    .from("table_sessions")
    .select("*")
    .in("status", [
      "OPEN",
      "ACTIVE",
      "OCCUPIED",
      "ORDERING",
      "READY_FOR_PAYMENT",
      "PARTIAL",
    ]);

  if (organizationId) {
    query = query.eq(
      "organization_id",
      organizationId
    );
  }

  if (tableId) {
    query = query.eq("table_id", tableId);
  } else if (tableNumber) {
    query = query.eq("table_number", tableNumber);
  } else {
    throw new Error("tableId or tableNumber required");
  }

  const { data, error } = await query
    .order("started_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return data?.[0] || null;
}
