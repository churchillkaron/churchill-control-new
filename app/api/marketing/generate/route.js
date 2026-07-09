export const dynamic = "force-dynamic";

import { NextResponse }
from "next/server";

import { createCampaignFlow }
from "@/lib/marketing/services/createCampaignFlow";

export async function POST(request) {

  try {

    const body =
      await request.json();

    if (process.env.NODE_ENV !== "production") console.log(
      "GENERATE BODY:",
      JSON.stringify(
        body,
        null,
        2
      )
    );

    const {
      pageId,

      prompt,

      poster,

      selectedAssets,

      selectedBusiness,

    } = body;

    if (process.env.NODE_ENV !== "production") console.log({
      pageId,

      selectedBusiness,

    });
poster.selectedBusiness =
  selectedBusiness;
  
    const campaign =
      await createCampaignFlow({
        pageId:
          pageId || null,

        prompt:
          prompt || "",

        poster,

        selectedAssets:
          selectedAssets || [],

      });

    return NextResponse.json({

      success: true,

      campaign,

    });

  } catch (err) {

    console.error(
      "MARKETING GENERATE API ERROR:",
      err
    );

    return NextResponse.json(

      {

        success: false,

        error:
          err.message,

      },

      {
        status: 500,
      }

    );

  }

}