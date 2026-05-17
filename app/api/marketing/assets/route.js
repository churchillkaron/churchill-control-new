export const dynamic = "force-dynamic";

import { NextResponse }
from "next/server";

import { supabase }
from "@/lib/shared/supabase/client";

export async function GET() {

  try {

    const {
      data,
      error,
    } = await supabase

      .from(
        "marketing_assets"
      )

      .select("*")

      .order(
        "created_at",
        {
          ascending: false,
        }
      )

      .limit(200);

    if (error) {

      throw error;

    }

    return NextResponse.json({

      success: true,

      assets:
        data || [],

    });

  } catch (err) {

    console.error(
      "LOAD MARKETING ASSETS ERROR:",
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