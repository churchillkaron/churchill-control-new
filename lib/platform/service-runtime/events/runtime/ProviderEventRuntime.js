import {

  create,

  listByOrganization,

} from "../repositories/ProviderEventRepository";


import {

  AttributionRuntime,

} from "@/lib/platform/service-runtime/attribution/runtime/AttributionRuntime";

import {

  CustomerIdentityRuntime,

} from "@/lib/platform/service-runtime/identity/runtime/CustomerIdentityRuntime";


export const ProviderEventRuntime = {


  async record({

    organization_id,

    connection_id = null,

    provider_id,

    asset_id = null,

    event_type,

    external_event_id = null,

    customer_reference = null,

    value = 0,

    currency = "USD",

    payload = {},

  }) {


    const event =
      await create({

        organization_id,

        connection_id,

        provider_id,

        asset_id,

        event_type,

        external_event_id,

        customer_reference,

        value,

        currency,

        payload,

      });



    let identity = null;


    if (customer_reference) {

      identity =
        await CustomerIdentityRuntime.resolve({

          organization_id,

          provider_id,

          external_id:
            customer_reference,

        }).catch(
          () => null
        );

    }



    await AttributionRuntime.record({

      organization_id,

      provider_event_id:
        event.id,

      provider_id,

      source_type:
        "PROVIDER",

      source_id:
        external_event_id,

      party_id:
        identity?.party_id ||
        null,

      lead_id:
        identity?.lead_id ||
        null,

      event_type,

      value,

      currency,

      metadata: payload,

    });


    return event;


  },



  async organization(
    organization_id
  ) {

    return listByOrganization(
      organization_id
    );

  },


};
