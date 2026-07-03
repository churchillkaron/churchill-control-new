import { supabase } from "@/lib/shared/supabase/client";
import defaultPOSSettings from "@/lib/settings/defaultPOSSettings";

export async function loadWaiterData(organizationId) {
  if (!organizationId || typeof organizationId !== "string") {
    return {
      zones: [],
      tables: [],
      dishes: [],
      posSettings: defaultPOSSettings || {},
    };
  }

  const [
    zonesRes,
    tablesRes,
    dishesRes,
    settingsRes,
  ] = await Promise.all([
    supabase
      .from("restaurant_zones")
      .select("*")
      .eq("organization_id", organizationId)
      .order("sort_order"),

    supabase
      .from("restaurant_tables")
      .select("*")
      .eq("organization_id", organizationId)
      .order("table_number"),

    supabase
      .from("dishes")
      .select("*")
      .eq("organization_id", organizationId)
      .order("name"),

    supabase
      .from("operational_settings")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("domain", "POS")
      .maybeSingle(),
  ]);

  if (zonesRes.error) throw zonesRes.error;
  if (tablesRes.error) throw tablesRes.error;
  if (dishesRes.error) throw dishesRes.error;

  const storedSettings = settingsRes?.data?.settings || {};

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

    posSettings: {
      ...(defaultPOSSettings || {}),
      ...storedSettings,
    },
  };
}
