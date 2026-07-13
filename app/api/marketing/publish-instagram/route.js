export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { supabase }
from "@/lib/shared/supabase/client";

import {
  MetaProvider,
} from "@/lib/platform/service-runtime/providers/meta/MetaProvider";

import {
  ChannelAssetRuntime,
} from "@/lib/platform/channels/runtime/ChannelAssetRuntime";

import {
  ChannelConnectionRuntime,
} from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";

import {
  resolveChannelCredential,
} from "@/lib/platform/channels/helpers/resolveChannelCredential";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const {
      caption,
      image_url,
      page_id,
      organization_id,
    } = body;


    const asset =
      await ChannelAssetRuntime.find({

        organization_id,

        provider:
          "meta",

        asset_type:
          "facebook_page",

        external_id:
          page_id,

      });


    if (!asset) {

      return NextResponse.json(
        {
          success:false,

          error:
            "Meta provider asset not found",
        },
        {
          status:404,
        }
      );

    }


    const connection =
      await ChannelConnectionRuntime.get({

        organization_id,

        provider:
          "meta",

      });


    if (!connection) {

      return NextResponse.json(
        {
          success:false,

          error:
            "Meta provider connection not found",
        },
        {
          status:404,
        }
      );

    }


    const instagram_business_id =
      asset.metadata?.instagram_business_id;


    const access_token =
      await resolveChannelCredential(
        connection
      );

    const result =
      await MetaProvider.execute({

        capability:
          "marketing.instagram.publish",

        organization_id,

        instagram_business_id,

        access_token,

        message:
          caption,

        image_url,

      });


    if (!result?.success) {

      return NextResponse.json(
        {
          success:false,
          error:
            result,
        },
        {
          status:500,
        }
      );

    }


    return NextResponse.json({

      success:true,

      result,

    });

  } catch (err) {

    console.error(
      "IG PUBLISH ERROR:",
      err
    );

    return NextResponse.json(
      {
        success: false,
        error:
          err.message,
      },
      { status: 500 }
    );

  }

}