import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req) {

  try {

    const body = await req.json();

    const {
      connected,
      access_token,
      page_name,
      page_id,
      instagram_business_id,
    } = body;

    const { data, error } = await supabase
      .from("meta_accounts")
      .upsert(
        [
          {
            connected,

            access_token,

            page_name,

            page_id,

            instagram_business_id,
          },
        ],
        {
          onConflict: "page_id",
        }
      )
      .select()
      .single();

    if (error) {

      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );

    }

    return NextResponse.json({
      success: true,
      account: data,
    });

  } catch (err) {

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