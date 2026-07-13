import {

  getByOrganizationChannel,

  listByOrganization,

  save,

} from "../repositories/ChannelConnectionRepository";


export const ChannelConnectionRuntime = {


  async get({

    organization_id,

    provider = null,

    provider_id = null,

  }){

    return getByOrganizationChannel({

      organization_id,

      provider:
        provider ||
        provider_id,

    });

  },


  async list(
    organization_id
  ){

    return listByOrganization(
      organization_id
    );

  },


  async connect({

    organization_id,

    provider = null,

    provider_id = null,

    channel_type,

    credentials_reference = null,

    metadata = {},

  }){

    return save({

      organization_id,

      provider:
        provider ||
        provider_id,

      channel_type,

      credentials_reference,

      metadata,

      status:
        "ACTIVE",

    });

  },


  async disconnect({

    organization_id,

    provider = null,

    provider_id = null,

  }){

    return save({

      organization_id,

      provider:
        provider ||
        provider_id,

      status:
        "DISCONNECTED",

    });

  },


};
