import {
  getServiceSupabase,
} from "@/lib/shared/supabase/service";

import {
  ChannelConnectionRuntime,
} from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";

import {
  ChannelAssetRuntime,
} from "@/lib/platform/channels/runtime/ChannelAssetRuntime";


const supabaseAdmin =
  getServiceSupabase();


export async function getMetaAccounts({

  organizationId,

}) {

  if (!organizationId) {
    return [];
  }


  /*
    New runtime source
  */

  try {

    const connection =
      await ChannelConnectionRuntime.get({

        organization_id:
          organizationId,

        provider:
          "meta",

      });


    if (connection) {

      const pageId =
        connection.metadata?.page_id;


      if (pageId) {

        const asset =
          await ChannelAssetRuntime.find({

            organization_id:
              organizationId,

            provider:
              "meta",

            asset_type:
              "facebook_page",

            external_id:
              pageId,

          });


        if (asset) {

          return [
            {
              page_id:
                asset.external_id,

              page_name:
                asset.name,

              instagram_business_id:
                asset.metadata?.instagram_business_id ||
                null,

            },
          ];

        }

      }

    }

  } catch(error) {

    console.error(
      "META RUNTIME LOOKUP ERROR",
      error.message
    );

  }



  /*
    Legacy Marketing source
  */

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from("meta_accounts")
      .select("*")
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "connected",
        true
      );


  if (error) {

    throw error;

  }


  return (data || [])
    .map(account => ({

      page_id:
        account.page_id,

      page_name:
        account.page_name,

      instagram_business_id:
        account.instagram_business_id ||
        null,

    }));

}
