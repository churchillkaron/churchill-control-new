import { NextResponse } from "next/server";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const {
      data,
      error,
    } = await supabaseAdmin

      .from(
        "approval_requests"
      )

      .select("*")

      .eq(
        "tenant_id",
        body.tenant_id
      )

      .eq(
        "type",
        "deployment"
      )

      .order(
        "created_at",
        {
          ascending: false,
        }
      )

      .limit(1)

      .single();

    if (error) {

      return NextResponse.json({

        approved: false,

        error:
          error.message,

      });

    }

    return NextResponse.json({

      approved:
        data?.status ===
        "approved",

      request:
        data,

    });

  } catch (error) {

    return NextResponse.json(
      {

        approved: false,

        error:
          error.message,

      },
      {
        status: 500,
      }
    );

  }

}
