import { NextResponse }
from "next/server";

import { buildReceipt }
from "@/lib/pos/receipts/buildReceipt";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

// ======================================
// GET RECEIPT
// ======================================

export async function GET(req) {

  try {

    const { searchParams } =
      new URL(req.url);

    const orderId =
      searchParams.get(
        "order_id"
      );

    if (!orderId) {

      return NextResponse.json(
        {
          success: false,
          error:
            "order_id required",
        },
        {
          status: 400,
        }
      );

    }

    const {
      data: order,
      error: orderError,
    } = await supabaseAdmin

      .from("orders")

      .select("*")

      .eq("id", orderId)

      .single();

    if (orderError) {
      throw orderError;
    }

    const {
      data: items,
    } = await supabaseAdmin

      .from("order_items")

      .select("*")

      .eq(
        "order_id",
        orderId
      );

    const {
      data: payments,
    } = await supabaseAdmin

      .from("payment_transactions")

      .select("*")

      .eq(
        "order_id",
        orderId
      );

    const receipt =
      buildReceipt({

        order,

        items:
          items || [],

        payments:
          payments || [],

        cashier:
          order.cashier_name,

        table:
          order.table_number,

        guests:
          order.guest_count || 1,

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

// ======================================
// CREATE RECEIPT
// ======================================

export async function POST(req) {

  try {

    const body =
      await req.json();

    const receipt =
      buildReceipt({

        order:
          body.order,

        items:
          body.items || [],

        payments:
          body.payments || [],

        cashier:
          body.cashier,

        table:
          body.table,

        guests:
          body.guests,

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
