import {
  NextResponse,
} from "next/server";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const tenantId =
      body?.tenant_id;

    if (!tenantId) {

      return NextResponse.json(
        {
          success: false,
          error:
            "tenant_id required",
        },
        {
          status: 400,
        }
      );

    }

    const {
      data,
      error,
    } = await supabaseAdmin

      .from("vendors")

      .select("*")

      .eq(
        "tenant_id",
        tenantId
      )

      .order(
        "display_name",
        {
          ascending: true,
        }
      );

    if (error) {

      throw error;

    }

    return NextResponse.json({

      success: true,

      vendors:
        data || [],

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
