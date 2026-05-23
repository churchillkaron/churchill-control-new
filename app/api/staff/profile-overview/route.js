import { NextResponse } from "next/server";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export async function GET(req) {

  try {

    const { searchParams } =
      new URL(req.url);

    const tenant_id =
      searchParams.get("tenant_id");

    const email =
      searchParams.get("email");

    if (!tenant_id || !email) {

      return NextResponse.json(
        {
          success: false,
          error:
            "Missing tenant_id or email",
        },
        {
          status: 400,
        }
      );

    }

    const {
      data: staff,
    } = await supabaseAdmin

      .from("staff_accounts")

      .select("*")

      .eq(
        "tenant_id",
        tenant_id
      )

      .eq(
        "email",
        email
      )

      .single();

    const {
      data: payroll,
    } = await supabaseAdmin

      .from("payroll_records")

      .select("*")

      .eq(
        "tenant_id",
        tenant_id
      )

      .eq(
        "staff_id",
        staff?.id
      )

      .order(
        "created_at",
        {
          ascending: false,
        }
      )

      .limit(5);

    const {
      data: messages,
    } = await supabaseAdmin

      .from("staff_messages")

      .select("*")

      .eq(
        "tenant_id",
        tenant_id
      )

      .or(
        `to_email.eq.${email},from_email.eq.${email}`
      )

      .order(
        "created_at",
        {
          ascending: false,
        }
      )

      .limit(10);

    return NextResponse.json({

      success: true,

      profile: {

        staff,

        payroll:
          payroll || [],

        messages:
          messages || [],

      },

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
