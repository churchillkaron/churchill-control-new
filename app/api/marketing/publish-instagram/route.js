import { NextResponse } from "next/server";

import { supabase }
from "@/lib/supabase";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const {
      caption,
      image_url,
      page_id,
    } = body;

    // GET ACCOUNT

    const {
      data: account,
      error: accountError,
    } = await supabase
      .from("meta_accounts")
      .select("*")
      .eq("page_id", page_id)
      .single();

    if (
      accountError ||
      !account
    ) {

      return NextResponse.json(
        {
          success: false,
          error:
            "Meta account not found",
        },
        { status: 500 }
      );

    }

    const instagram_business_id =
      account.instagram_business_id;

    const access_token =
      account.access_token;

    // STEP 1
    // CREATE MEDIA CONTAINER

    const containerRes =
      await fetch(
        `https://graph.facebook.com/v23.0/${instagram_business_id}/media`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            image_url,
            caption,
            access_token,
          }),
        }
      );

    const containerData =
      await containerRes.json();

    console.log(
      "IG CONTAINER:",
      containerData
    );

    if (!containerData.id) {

      return NextResponse.json(
        {
          success: false,
          error:
            containerData,
        },
        { status: 500 }
      );

    }

    // STEP 2
    // PUBLISH POST

    const publishRes =
      await fetch(
        `https://graph.facebook.com/v23.0/${instagram_business_id}/media_publish`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            creation_id:
              containerData.id,

            access_token,
          }),
        }
      );

    const publishData =
      await publishRes.json();

    console.log(
      "IG PUBLISH:",
      publishData
    );

    return NextResponse.json({
      success: true,
      container:
        containerData,
      publish:
        publishData,
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