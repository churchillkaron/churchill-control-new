import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import buildReceipt from "@/lib/pos/receipts/buildReceipt";

export async function GET(req) {

  try {

    const order_id =
      req.nextUrl.searchParams.get(
        "order_id"
      );

    const {
      data: order,
      error: orderError,
    } = await supabaseAdmin
      .from("pos_orders")
      .select("*")
      .eq(
        "id",
        order_id
      )
      .single();

    if (orderError) {
      throw orderError;
    }

    const {
      data: items,
      error: itemsError,
    } = await supabaseAdmin
      .from("pos_order_items")
      .select("*")
      .eq(
        "order_id",
        order_id
      );

    if (itemsError) {
      throw itemsError;
    }

    const {
      data: payment,
    } = await supabaseAdmin
      .from("pos_payments")
      .select("*")
      .eq(
        "order_id",
        order_id
      )
      .single();

    const receipt =
      buildReceipt({

        order,

        items:
          items || [],

        payment,
      });

    return NextResponse.json({

      success: true,

      receipt,
    });

  } catch (error) {

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
