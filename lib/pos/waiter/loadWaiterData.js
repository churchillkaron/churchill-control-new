import { supabase } from "@/lib/shared/supabase/client";


export async function loadWaiterData(tenantId) {
  if (!tenantId) {
    
console.log("WAITER LOAD RESULT", {
  zones: zonesRes.data,
  tables: tablesRes.data,
  dishes: dishesRes.data,
});


console.log("WAITER LOAD RESULT", {
  zones: zonesRes.data,
  tables: tablesRes.data,
  dishes: dishesRes.data,
});

const mergedOrdersByTable = async (tenantId, tables) => {
  const { loadMergedTableOrders } = await import('@/lib/restaurant/services/loadMergedTableOrders')

  const results = await Promise.all(
    tables.map(async (t) => {
      const orders = await loadMergedTableOrders({
        tenantId,
        tableNumber: t.table_number
      })

      return {
        ...t,
        mergedOrders: orders
      }
    })
  )

  return results
}

return {


      zones: [],
      tables: [],
      dishes: [],
    };
  }

  const [zonesRes, tablesRes, dishesRes] =
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
    ]);

  if (zonesRes.error) throw zonesRes.error;
  if (tablesRes.error) throw tablesRes.error;
  if (dishesRes.error) throw dishesRes.error;

  
console.log("WAITER LOAD RESULT", {
  zones: zonesRes.data,
  tables: tablesRes.data,
  dishes: dishesRes.data,
});


console.log("WAITER LOAD RESULT", {
  zones: zonesRes.data,
  tables: tablesRes.data,
  dishes: dishesRes.data,
});

const mergedOrdersByTable = async (tenantId, tables) => {
  const { loadMergedTableOrders } = await import('@/lib/restaurant/services/loadMergedTableOrders')

  const results = await Promise.all(
    tables.map(async (t) => {
      const orders = await loadMergedTableOrders({
        tenantId,
        tableNumber: t.table_number
      })

      return {
        ...t,
        mergedOrders: orders
      }
    })
  )

  return results
}

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
  };
}
