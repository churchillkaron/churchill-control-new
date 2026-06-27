export class RestaurantSettings {

  constructor(data = {}) {

    this.organizationId =
      data.entity_id;

    this.taxProfileId =
      data.tax_profile_id;

    this.serviceChargeProfileId =
      data.service_charge_profile_id;

    this.paymentProfileId =
      data.payment_profile_id;

    this.kitchenSettingsId =
      data.kitchen_settings_id;

    this.productionSettingsId =
      data.production_settings_id;

    this.reservationSettingsId =
      data.reservation_settings_id;

  }

}
