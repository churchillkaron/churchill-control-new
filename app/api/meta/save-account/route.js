import { createServerSupabase } from "@/lib/shared/supabase/server";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  ChannelConnectionRuntime,
} from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";

import {
  ChannelAssetRuntime,
} from "@/lib/platform/channels/runtime/ChannelAssetRuntime";

import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";

export const runtime = "nodejs";

export async function POST(req) {

  const supabase = createServerSupabase();

  try {

    const body = await req.json();

    const {
      connected,
      access_token,
      page_name,
      page_id,
      instagram_business_id,
    } = body;

    /*
      UNIVERSAL PROVIDER CONNECTION
      Move Meta into Service Runtime
    */

    const organization_id =
      body.organization_id ||
      null;


    if (organization_id) {


      const credential =
        await CredentialRuntime.store({

          provider:
            "meta",

          credential_type:
            "oauth_token",

          secret_reference:
            access_token,

          metadata: {

            page_id,

            page_name,

          },

        });



      await ChannelConnectionRuntime.connect({

        organization_id,

        provider:
          "meta",

        channel_type:
          "social",

        credentials_reference:
          credential.id,

        metadata: {

          page_id,

          instagram_business_id,

        },

      });



      const connection =
        await ChannelConnectionRuntime.get({

          organization_id,

          provider:
            "meta",

        });


      if (connection) {

        await ChannelAssetRuntime.register({

          organization_id,

          connection_id:
            connection.id,

          provider:
            "meta",

          asset_type:
            "facebook_page",

          external_id:
            page_id,

          name:
            page_name,

          metadata: {

            instagram_business_id,

          },

        });


        if (instagram_business_id) {

          await ChannelAssetRuntime.register({

            organization_id,

            connection_id:
              connection.id,

            provider:
              "meta",

            asset_type:
              "instagram_business",

            external_id:
              instagram_business_id,

            name:
              page_name,

          });

        }

      }

    }


    return NextResponse.json({
      success: true,
      account: {
        page_id,
        page_name,
        instagram_business_id,
      },
    });

  } catch (err) {

    console.error(
      "META SAVE SERVER ERROR:",
      err
    );

    return NextResponse.json(
      {
        error:
          err.message ||
          "Save account failed",
      },
      { status: 500 }
    );

  }
}