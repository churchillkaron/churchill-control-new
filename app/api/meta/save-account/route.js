import { createServerSupabase } from "@/lib/shared/supabase/server";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

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

      console.error(
        "META SAVE ERROR:",
        error
      );

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