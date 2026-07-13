import {
  getServiceSupabase,
} from "@/lib/shared/supabase/service";

import {
  ProviderConnectionRuntime,
} from "@/lib/platform/service-runtime/connections/runtime/ProviderConnectionRuntime";

import {
  ProviderAssetRuntime,
} from "@/lib/platform/service-runtime/connections/runtime/ProviderAssetRuntime";


const supabase =
  getServiceSupabase();


async function migrate() {


  const {
    data: accounts,
    error,
  } =
    await supabase
      .from("meta_accounts")
      .select("*")
      .eq(
        "connected",
        true
      );


  if (error) {
    throw error;
  }


  for (const account of accounts || []) {


    console.log(
      "Migrating:",
      account.page_name,
      account.organization_id
    );


    const connection =
      await ProviderConnectionRuntime.connect({

        organization_id:
          account.organization_id,

        provider_id:
          "meta",

        connection_type:
          "oauth",

        configuration: {

          page_id:
            account.page_id,

          instagram_business_id:
            account.instagram_business_id,

        },

      });


    await ProviderAssetRuntime.register({

      organization_id:
        account.organization_id,

      connection_id:
        connection.id,

      provider_id:
        "meta",

      asset_type:
        "facebook_page",

      external_id:
        account.page_id,

      name:
        account.page_name,

      metadata: {

        instagram_business_id:
          account.instagram_business_id,

      },

    });


    if (
      account.instagram_business_id
    ) {

      await ProviderAssetRuntime.register({

        organization_id:
          account.organization_id,

        connection_id:
          connection.id,

        provider_id:
          "meta",

        asset_type:
          "instagram_business",

        external_id:
          account.instagram_business_id,

        name:
          account.page_name,

      });

    }

  }


  console.log(
    "META MIGRATION COMPLETE"
  );

}


migrate()
  .catch(error => {

    console.error(
      error
    );

    process.exit(1);

  });
