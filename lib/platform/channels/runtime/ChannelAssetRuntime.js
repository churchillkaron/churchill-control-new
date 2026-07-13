import {
  save,
  find,
  listByConnection,
} from "../repositories/ChannelAssetRepository";


export const ChannelAssetRuntime = {


  async register({

    organization_id,

    connection_id,

    provider = null,

    channel_provider = null,

    asset_type,

    external_id,

    name,

    metadata = {},

  }){


    return save({

      organization_id,

      connection_id,

      channel_provider:
        channel_provider ||
        provider,

      asset_type,

      external_id,

      name,

      metadata,

    });


  },




  async list({

    organization_id,

    connection_id,

  }){

    return listByConnection({

      organization_id,

      connection_id,

    });

  },


  async find({

    organization_id,

    provider = null,

    channel_provider = null,

    asset_type,

    external_id,

  }){


    return find({

      organization_id,

      channel_provider:
        channel_provider ||
        provider,

      asset_type,

      external_id,

    });


  },


};
