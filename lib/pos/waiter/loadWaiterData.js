import { supabase } from "@/lib/shared/supabase/client";

export async function loadWaiterData(tenantId) {
  if (!tenantId) {
    return {
      zones: [],
      tables: [],
      dishes: [],
    };
  }

  const [
    zonesRes,
    tablesRes,
    dishesRes,
    settingsRes
  ] =
    await Promise.all([
      supabase
        .from("restaurant_zones")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("sort_order"),

      supabase
        .from("restaurant_tables")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("table_name"),

      supabase
        .from("dishes")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("name"),

      fetch(
        `/api/pos/settings?tenantId=${tenantId}`
      ).then(r => r.json()),
    ]);

  console.log("WAITER DATA DEBUG", {
  tenantId,
  zonesCount: zonesRes.data?.length || 0,
  tablesCount: tablesRes.data?.length || 0,
  firstZone: zonesRes.data?.[0],
  firstTable: tablesRes.data?.[0],
  zoneError: zonesRes.error,
  tableError: tablesRes.error
});

if (zonesRes.error) throw zonesRes.error;
  if (tablesRes.error) throw tablesRes.error;
  if (dishesRes.error) throw dishesRes.error;

  return {
    zones: zonesRes.data || [],

    tables: [...(tablesRes.data || [])].sort(
      (a, b) =>
        Number(
          String(a.table_name || a.table_number || "")
            .replace(/\D/g, "")
        ) -
        Number(
          String(b.table_name || b.table_number || "")
            .replace(/\D/g, "")
        )
    ),

    dishes: dishesRes.data || [],

    posSettings:
      settingsRes?.settings || null,
  };
}
