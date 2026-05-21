import { NextResponse }
from "next/server";

import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

export async function GET() {

  try {

    const supabase =
      createServerSupabase();

    const {
      data,
      error,
    } = await supabase

      .from("orders")

      .select(`
        *,
        kitchen_ticket_items (
          id,
          status
        )
      `)

      .order(
        "created_at",
        {
          ascending: false,
        }
      )

      .limit(20);

    if (error) {
      throw error;
    }

    return NextResponse.json({

      success: true,

      data,

    });

  } catch (error) {

    console.error(error);

    return NextResponse.json(

      {
        success: false,
        error:
          error.message,
      },

      {
        status: 500,
      }

    );

  }

}
