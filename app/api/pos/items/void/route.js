import { NextResponse } from "next/server";

import {
  createClient,
} from "@supabase/supabase-js";

const supabase =
  createClient(

    process.env.NEXT_PUBLIC_SUPABASE_URL,

    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

export async function POST(req) {

  try {

    const body =
      await req.json();

    const {
      item,
      reason,
    } = body;

    const {
      error,
    } = await supabase

      .from("order_items")

      .update({

        status:
          "VOID_PENDING",

        void_reason:
          reason,

      })

      .eq(
        "id",
        item.id
      );

    if (error)
      throw error;

    return NextResponse.json({

      success: true,

    });

  } catch (err) {

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
