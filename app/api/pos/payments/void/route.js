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
      payment,
      reason,
    } = body;

    // =========================
    // LOAD PAYMENT
    // =========================

    const {
      data: existingPayment,
      error: loadError,
    } = await supabase

      .from("pos_payments")

      .select("*")

      .eq(
        "id",
        payment.id
      )

      .single();

    if (loadError) {
      throw loadError;
    }

    // =========================
    // PERIOD LOCK
    // =========================

    if (
      existingPayment?.period_closed
    ) {

      return NextResponse.json(
        {
          success: false,

          error:
            "Accounting period closed",
        },
        {
          status: 403,
        }
      );

    }

    // =========================
    // VOID REQUEST
    // =========================

    const {
      error,
    } = await supabase

      .from("pos_payments")

      .update({

        payment_status:
          "VOID_PENDING",

        void_reason:
          reason,

      })

      .eq(
        "id",
        payment.id
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
