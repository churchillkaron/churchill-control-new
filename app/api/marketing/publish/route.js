import { NextResponse }
from "next/server";

import { supabase }
from "@/lib/supabase";

import { getMetaAccount }
from "@/lib/meta/getMetaAccount";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const {
      campaignId,
      tenantId,
    } = body;

    const { data: campaign } =
      await supabase
        .from(
          "marketing_campaigns"
        )
        .select("*")
        .eq("id", campaignId)
        .single();

    if (!campaign) {

      return NextResponse.json(
        {
          error:
            "Campaign not found",
        },
        { status: 404 }
      );
    }

    const metaAccount =
      await getMetaAccount(
        tenantId
      );

    if (!metaAccount) {

      return NextResponse.json(
        {
          error:
            "Meta account missing",
        },
        { status: 400 }
      );
    }

    console.log(
      "READY TO PUBLISH:",
      {
        campaign,
        metaAccount,
      }
    );

    return NextResponse.json({

      success: true,

      message:
        "Publish pipeline ready",
    });

  } catch (err) {

    console.error(err);

    return NextResponse.json(
      {
        error:
          err.message,
      },
      { status: 500 }
    );
  }
}