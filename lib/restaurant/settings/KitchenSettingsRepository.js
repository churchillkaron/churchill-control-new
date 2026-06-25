import {
  loadRestaurantSettings,
} from "./RestaurantSettingsRepository";

export async function loadKitchenSettings(
  organizationId
) {

  const restaurant =
    await loadRestaurantSettings(
      organizationId
    );

  const kitchen =
    restaurant.kitchen_settings;

  if (!kitchen) {
    throw new Error(
      "Kitchen Settings not configured."
    );
  }

  const required = [

    "refresh_interval_ms",

    "priority_levels",

  ];

  const missing =
    required.filter(
      key =>
        kitchen[key] === null ||
        kitchen[key] === undefined
    );

  if (missing.length) {
    throw new Error(
      "Kitchen Settings missing: " +
      missing.join(", ")
    );
  }

  return kitchen;

}
