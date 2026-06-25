import { supabaseAdmin } from "@/lib/shared/supabase/admin";

let cache = new Map();

export async function loadRestaurantSettings(
  organizationId
) {

  if (!organizationId) {
    throw new Error(
      "organizationId required"
    );
  }

  if (cache.has(organizationId)) {
    return cache.get(
      organizationId
    );
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("restaurant_settings")
    .select("*")
    .eq(
      "organization_id",
      organizationId
    )
    .single();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error(
      "Restaurant Settings not configured for organization."
    );
  }

  const required = [

    "tax_rate",

    "service_charge_rate",

    "default_payment_method",

    "kitchen_refresh_interval_ms",

    "kitchen_warning_minutes",

    "kitchen_urgent_minutes",

    "kitchen_critical_minutes",

  ];

  const missing =
    required.filter(
      key =>
        data[key] === null ||
        data[key] === undefined
    );

  if (missing.length) {
    throw new Error(
      "Restaurant Settings missing: " +
      missing.join(", ")
    );
  }

  cache.set(
    organizationId,
    data
  );

  return data;

}

export function clearRestaurantSettingsCache(
  organizationId
) {

  if (organizationId) {
    cache.delete(
      organizationId
    );
    return;
  }

  cache.clear();

}
