import { NextResponse }
from "next/server";

import { supabase }
from "@/lib/supabase";

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
        "campaign_publish_queue"
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

      .limit(100);

    if (error) {

      throw error;

    }

    return NextResponse.json({

      success: true,

      queue:
        data || [],

    });

  } catch (err) {

    console.error(
      "QUEUE API ERROR:",
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