import {
  ChannelConnectionRuntime,
} from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";

import {
  ChannelAssetRuntime,
} from "@/lib/platform/channels/runtime/ChannelAssetRuntime";

import {
  resolveChannelCredential,
} from "@/lib/platform/channels/helpers/resolveChannelCredential";


export async function getMetaAccount({

  organization_id,

  page_id = null,

} = {}) {


  try {


    const connection =
      await ChannelConnectionRuntime.get({

        organization_id,

        provider:
          "meta",

      });


    if (!connection) {

      return {

        success:false,

        error:
          "Meta provider connection not found",

      };

    }


    const access_token =
      await resolveChannelCredential(
        connection
      );


    let asset =
      null;


    if (page_id) {

      asset =
        await ChannelAssetRuntime.find({

          organization_id,

          provider:
            "meta",

          asset_type:
            "facebook_page",

          external_id:
            page_id,

        });

    }


    return {

      success:true,

      data:{

        connection,

        asset,

        access_token,

        page_id:
          asset?.external_id ||
          connection.metadata?.page_id,

        instagram_business_id:
          asset?.metadata?.instagram_business_id ||
          connection.metadata?.instagram_business_id,

      },

    };


  } catch(error) {

    return {

      success:false,

      error:
        error.message,

    };

  }

}
