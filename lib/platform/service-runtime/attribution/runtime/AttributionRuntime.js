import {
  create,
  listByOrganization,
} from "../repositories/AttributionRepository";


export const AttributionRuntime = {


  async record({

    organization_id,

    provider_event_id = null,

    provider_id,

    source_type,

    source_id = null,

    event_type,

    party_id = null,

    lead_id = null,

    reservation_id = null,

    order_id = null,

    invoice_id = null,

    value = 0,

    currency = "USD",

    metadata = {},

  }) {


    return create({

      organization_id,

      provider_event_id,

      provider_id,

      source_type,

      source_id,

      event_type,

      party_id,

      lead_id,

      reservation_id,

      order_id,

      invoice_id,

      value,

      currency,

      metadata,

    });


  },



  async organization(
    organization_id
  ) {

    return listByOrganization(
      organization_id
    );

  },


};
