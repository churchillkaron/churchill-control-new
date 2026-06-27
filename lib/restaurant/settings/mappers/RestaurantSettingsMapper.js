import {
  RestaurantSettings,
} from "../documents/RestaurantSettings";

export function mapRestaurantSettings(
  row
) {

  return new RestaurantSettings({

    organizationId:
      row.entity_id,

    taxProfileId:
      row.tax_profile_id,

    serviceChargeProfileId:
      row.service_charge_profile_id,

    paymentProfileId:
      row.payment_profile_id,

    kitchenSettingsId:
      row.kitchen_settings_id,

    reservationSettingsId:
      row.reservation_settings_id,

    productionSettingsId:
      row.production_settings_id,

  });

}
