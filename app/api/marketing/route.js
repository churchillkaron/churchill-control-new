import { NextResponse } from "next/server";

import { supabase }
from "@/lib/supabase";

export const dynamic =
  "force-dynamic";

export async function GET() {

  try {

    const {
      data,
      error,
    } = await supabase
      .from(
        "marketing_campaigns"
      )
      .select("*")
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error) {

      console.error(
        "MARKETING API ERROR:",
        error
      );

      return NextResponse.json(
        [],
        { status: 200 }
      );

    }

    return NextResponse.json(
      data || []
    );

  } catch (error) {

    console.error(
      "MARKETING API CRASH:",
      error
    );

    return NextResponse.json(
      [],
      { status: 200 }
    );

  }

}