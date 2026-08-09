import { supabase } from "@/lib/supabase";

function requireOrganizationId(organizationId) {
  const value = String(organizationId || "").trim();

  if (!value) {
    throw new Error("organizationId required");
  }

  return value;
}

export function createRealtimeChannel({
  name,
  tables = [],
  callback,
  organizationId = null,
}) {
  const channel = supabase.channel(name);

  tables.forEach((table) => {
    const config = {
      event: "*",
      schema: "public",
      table,
    };

    if (organizationId) {
      config.filter = `organization_id=eq.${organizationId}`;
    }

    channel.on(
      "postgres_changes",
      config,
      callback
    );
  });

  channel.subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function loadOrders(organizationId) {
  const resolvedOrganizationId = requireOrganizationId(organizationId);

  const { data, error } = await supabase
    .from("orders")
    .select(`
      *,
      order_items(*)
    `)
    .eq("organization_id", resolvedOrganizationId)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error(error);
    return [];
  }

  return data || [];
}

export async function loadTables(organizationId) {
  const resolvedOrganizationId = requireOrganizationId(organizationId);

  const { data, error } = await supabase
    .from("restaurant_tables")
    .select("*")
    .eq("organization_id", resolvedOrganizationId)
    .order("table_number", {
      ascending: true,
    });

  if (error) {
    console.error(error);
    return [];
  }

  return data || [];
}

export async function loadStaff(organizationId) {
  const resolvedOrganizationId = requireOrganizationId(organizationId);

  const { data, error } = await supabase
    .from("staff_accounts")
    .select("*")
    .eq("active_organization_id", resolvedOrganizationId)
    .eq("active", true)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error(error);
    return [];
  }

  return data || [];
}

export async function loadIngredients(organizationId) {
  const resolvedOrganizationId = requireOrganizationId(organizationId);

  const { data, error } = await supabase
    .from("ingredients")
    .select("*")
    .eq("organization_id", resolvedOrganizationId)
    .order("name", {
      ascending: true,
    });

  if (error) {
    console.error(error);
    return [];
  }

  return data || [];
}
