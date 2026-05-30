import { NextResponse } from "next/server";

import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {

  try {

    const supabase =
      createServerSupabase();

    const { searchParams } =
      new URL(req.url);

    const module =
      searchParams.get("module");

    let query =
      supabase
        .from(
          "ai_intake_submissions"
        )
        .select("*")
        .order(
          "created_at",
          {
            ascending: false,
          }
        );

    if (
      module &&
      module !== "ALL"
    ) {

      query =
        query.eq(
          "ai_module",
          module
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

      submissions:
        data || [],

    });

  } catch (error) {

    console.error(
      "INTAKE LIST ERROR",
      error
    );

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
