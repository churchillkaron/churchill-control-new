import {
  loadRestaurantSettings,
} from "./RestaurantSettingsRepository";

export async function getDefaultPaymentMethod(
  organizationId
) {

  const settings =
    await loadRestaurantSettings(
      organizationId
    );

  return (
    settings.default_payment_method ||
    null
  );

}
