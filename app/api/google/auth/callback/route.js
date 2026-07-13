export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getOAuthClient }
from "@/lib/integrations/googleAuth";

import {
  ChannelConnectionRuntime,
} from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";

import {
  ChannelAssetRuntime,
} from "@/lib/platform/channels/runtime/ChannelAssetRuntime";

import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000";

export async function GET(request) {

  try {

    const url =
      new URL(request.url);

    const code =
      url.searchParams.get("code");

    if (!code) {

      return NextResponse.redirect(
        `${BASE_URL}/settings/connections/business-profiles?error=no_code`
      );
    }

    const oauth2Client =
      getOAuthClient();

    const {
      tokens,
    } =
      await oauth2Client.getToken(
        code
      );

    const response =
      NextResponse.redirect(
        `${BASE_URL}/settings/connections/business-profiles`
      );

    const credential =
      await CredentialRuntime.store({

        provider:
          "google",

        credential_type:
          "oauth_token",

        secret_reference:
          JSON.stringify(tokens),

        metadata: {

          scopes:
            tokens.scope || null,

        },

      });


    /*
      UNIVERSAL GOOGLE PROVIDER CONNECTION

      Temporary organization resolver:
      replace with authenticated context
      when OAuth is moved into workspace flow.
    */

    const organization_id =
      request.cookies.get(
        "organization_id"
      )?.value;


    if (organization_id) {

      const connection =
        await ChannelConnectionRuntime.connect({

          organization_id,

          provider:
            "google",

          channel_type:
            "business-profile",

          credentials_reference:
            credential.id,

          metadata: {

            scopes:
              tokens.scope || null,

          },

        });


      await ChannelAssetRuntime.register({

        organization_id,

        connection_id:
          connection.id,

        provider:
          "google",

        asset_type:
          "google_business_account",

        external_id:
          tokens.id_token ||
          "google-account",

        name:
          "Google Account",

        metadata: {

          scopes:
            tokens.scope || null,

        },

      });

    }


    return response;

  } catch (error) {

    console.error(error);

    return NextResponse.redirect(
      `${BASE_URL}/settings/connections/business-profiles?error=oauth_failed`
    );
  }
}
