import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const tenantId =
      searchParams.get("tenantId");

    const type =
      searchParams.get("type");

    const limit =
      Number(
        searchParams.get("limit") || 100
      );

    if (!tenantId) {
      return NextResponse.json(
        {
          success: false,
          error: "tenantId required",
        },
        { status: 400 }
      );
    }

    let query =
      supabaseAdmin
        .from("system_events")
        .select("*")
        .eq("tenant_id", tenantId);

    if (type) {
      query =
        query.eq("type", type);
    }

    const {
      data,
      error,
    } = await query
      .order(
        "created_at",
        { ascending: false }
      )
      .limit(limit);

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      events: data || [],
      count:
        data?.length || 0,
    });

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );

  }
}
