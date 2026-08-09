import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId: searchParams.get("organizationId") || searchParams.get("organization_id"),
      request,
    });

    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const { data, error } = await supabaseAdmin
      .from("dishes")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("name");

    if (error) throw error;

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      data: data || [],
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load dishes" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body?.organizationId || body?.organization_id || null,
      request,
    });

    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    if (!body?.name) {
      return NextResponse.json({ success: false, error: "Dish name required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("dishes")
      .insert({
        organization_id: access.organizationId,
        name: body.name,
        price: Number(body.price || 0),
        cost: 0,
        category: body.category || "main",
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      data,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to create dish" },
      { status: 500 }
    );
  }
}
