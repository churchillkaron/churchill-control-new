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

    let query =
      supabase

        .from(
          "engine_learning_memory"
        )

        .select("*")

        .order(
          "created_at",
          {
            ascending: false,
          }
        )

        .limit(500);

    if (tenantId) {

      query =
        query.eq(
          "tenant_id",
          tenantId
        );

    }

    if (pageId) {

      query =
        query.eq(
          "page_id",
          pageId
        );

    }

    const {
      data,
      error,
    } = await query;

    if (error) {

      throw error;

    }

    return NextResponse.json({

      success: true,

      learningMemory:
        data || [],

    });

  } catch (err) {

    console.error(
      "ENGINE LEARNING API ERROR:",
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