import { NextResponse }
from "next/server";

import { supabase }
from "@/lib/shared/supabase/client";

export async function POST(
  request
) {

  try {

    const body =
      await request.json();

    const {

      tenantId,

      pageId,

    } = body;

    const {
      data,
      error,
    } = await supabase

      .from(
        "marketing_campaigns"
      )

      .select("*")

      .eq(
        "tenant_id",
        tenantId
      )

      .eq(
        "page_id",
        pageId
      )

      .order(
        "created_at",
        {
          ascending: false,
        }
      )

      .limit(50);

    if (error) {

      throw error;

    }

    return NextResponse.json({

      success: true,

      campaigns:
        data || [],

    });

  } catch (err) {

    console.error(
      "CAMPAIGNS API ERROR:",
      err
    );

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