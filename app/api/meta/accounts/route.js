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

      .from("meta_accounts")

      .select("*")

      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error) {

      throw error;

    }

    return NextResponse.json({

      success: true,

      accounts:
        data || [],

    });

  } catch (err) {

    console.error(
      "META ACCOUNTS API ERROR:",
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