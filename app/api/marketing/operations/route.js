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

    if (
      !tenantId ||
      !pageId
    ) {

      return NextResponse.json(

        {
          success: false,
          error:
            "Missing tenantId or pageId",
        },

        {
          status: 400,
        }

      );

    }

    // GENERATION JOBS

    const {

      data: jobs,

    } = await supabase

      .from(
        "generation_jobs"
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

    // PUBLISH QUEUE

    const {

      data: queue,

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

    // CAMPAIGNS

    const {

      data: campaigns,

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

    // ASSETS

    const {

      data: assets,

    } = await supabase

      .from(
        "marketing_assets"
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
        "score",
        {
          ascending: false,
        }
      )

      .limit(20);

    return NextResponse.json({

      success: true,

      jobs:
        jobs || [],

      queue:
        queue || [],

      campaigns:
        campaigns || [],

      assets:
        assets || [],

    });

  } catch (err) {

    console.error(
      "MARKETING OPERATIONS ERROR:",
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