import {

  save,

  find,

} from "../repositories/CustomerIdentityRepository";


export const CustomerIdentityRuntime = {


  async link({

    organization_id,

    party_id = null,

    lead_id = null,

    provider_id,

    external_id,

    identity_type,

    metadata = {},

  }) {


    return save({

      organization_id,

      party_id,

      lead_id,

      provider_id,

      external_id,

      identity_type,

      metadata,

    });


  },



  async resolve({

    organization_id,

    provider_id,

    external_id,

  }) {


    return find({

      organization_id,

      provider_id,

      external_id,

    });


  },


};
