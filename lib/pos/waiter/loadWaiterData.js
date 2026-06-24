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
    tablesApi,
    dishesRes,
    settingsRes
  ] =
    await Promise.all([
      supabase
        .from("restaurant_zones")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("sort_order"),

      fetch(
        `/api/pos/tables?tenant_id=${tenantId}`
      ).then(r => r.json()),

      supabase
        .from("dishes")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("name"),

      fetch(
        `/api/pos/settings?tenantId=${tenantId}`
      ).then(r => r.json()),
    ]);

  if (zonesRes.error) throw zonesRes.error;
  if (dishesRes.error) throw dishesRes.error;

  const tables =
    tablesApi?.tables || [];

  console.log("WAITER TABLES API", {
    tenantId,
    count: tables.length,
    t9: tables.find(
      t => t.table_number === "T9"
    ),
  });

  console.log("WAITER_POS_SETTINGS", settingsRes);

  return {
    zones: zonesRes.data || [],

    tables: [...tables].sort(
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
