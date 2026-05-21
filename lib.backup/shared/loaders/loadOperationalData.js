import { supabase } from "@/lib/supabase";

export async function getTenantId() {

  return (
    process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID ||

    "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4"
  );

}

// ========================================
// REALTIME
// ========================================

export function createRealtimeChannel({
  name,
  tables = [],
  callback,
}) {

  const channel =
    supabase.channel(name);

  tables.forEach((table) => {

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
      },
      callback
    );

  });

  channel.subscribe();

  return () => {
    supabase.removeChannel(
      channel
    );
  };

}

// ========================================
// ORDERS
// ========================================

export async function loadOrders(
  tenantId
) {

  const { data, error } =
    await supabase

      .from("orders")

      .select(`
        *,
        order_items(*)
      `)

      .eq(
        "tenant_id",
        tenantId
      )

      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (error) {
    console.error(error);
    return [];
  }

  return data || [];

}

// ========================================
// TABLES
// ========================================

export async function loadTables(
  tenantId
) {

  const { data, error } =
    await supabase

      .from(
        "restaurant_tables"
      )

      .select("*")

      .eq(
        "tenant_id",
        tenantId
      )

      .order(
        "table_number",
        {
          ascending: true,
        }
      );

  if (error) {
    console.error(error);
    return [];
  }

  return data || [];

}

// ========================================
// STAFF
// ========================================

export async function loadStaff(
  tenantId
) {

  const { data, error } =
    await supabase

      .from(
        "staff_accounts"
      )

      .select("*")

      .eq(
        "tenant_id",
        tenantId
      )

      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (error) {
    console.error(error);
    return [];
  }

  return data || [];

}

// ========================================
// INGREDIENTS
// ========================================

export async function loadIngredients(
  tenantId
) {

  const { data, error } =
    await supabase

      .from(
        "ingredients"
      )

      .select("*")

      .eq(
        "tenant_id",
        tenantId
      )

      .order(
        "name",
        {
          ascending: true,
        }
      );

  if (error) {
    console.error(error);
    return [];
  }

  return data || [];

}
