import { NextResponse }
from "next/server";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

const tenantId =
  "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

export async function GET() {

  const {
    data,
    error,
  } = await supabaseAdmin

    .from("accounting_periods")

    .select("*")

    .eq(
      "tenant_id",
      tenantId
    )

    .order(
      "start_date",
      { ascending: false }
    );

  if (error) {

    return NextResponse.json({

      success: false,

      error:
        error.message,

    }, {

      status: 500,

    });

  }

  return NextResponse.json({

    success: true,

    periods:
      data || [],

  });

}
