export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const organizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    if (!organizationId) {
      return NextResponse.json({
        success: false,
        error: "organizationId required",
        categories: [],
      }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("inventory_categories")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message,
        categories: [],
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      categories: data || [],
      organizationId,
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      categories: [],
    }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      organizationId,
      name,
      code,
      description
    } = body;

    if (!organizationId || !name) {
      return NextResponse.json({
        success: false,
        error: "organizationId and name required",
      }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("inventory_categories")
      .insert({
        organization_id: organizationId,
        name,
        code,
        description,
        status: "active",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      category: data,
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
