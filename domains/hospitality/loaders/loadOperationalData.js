import { supabase } from "@/lib/supabase";

// ========================================
// TENANT
// ========================================

export async function getTenantId() {

  if (
    typeof window === "undefined"
  ) {

    return null;

  }

  const tenantId =
    document.cookie
      .split("; ")
      .find(
        row =>
          row.startsWith(
            "tenant_id="
          )
      )
      ?.split("=")[1];

  return tenantId || null;

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

  if (!tenantId) {
    return [];
  }

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

  if (!tenantId) {
    return [];
  }

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

  if (!tenantId) {
    return [];
  }

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

  if (!tenantId) {
    return [];
  }

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
