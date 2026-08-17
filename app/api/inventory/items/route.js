export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    let organizationId =
     searchParams.get("organizationId") ||
     searchParams.get("organization_id");

    const access = await requireOrganizationAccess({
     organizationId,
     request,
    });

    if (!access.success) {
     return NextResponse.json(
       { success: false, error: access.error },
       { status: access.status || 403 },
     );
    }

    organizationId = access.organizationId;


    if (!organizationId) {
     return NextResponse.json({
       success: false,
       error: "organizationId required",
       items: [],
     }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
     .from("inventory_items")
     .select("*")
     .eq("organization_id", organizationId)
     .order("created_at", { ascending: false });

    if (error) {
     return NextResponse.json({
       success: false,
       error: error.message,
       items: [],
     }, { status: 500 });
    }

    return NextResponse.json({
     success: true,
     items: data || [],
     organizationId,
    });

  } catch (error) {
    return NextResponse.json({
     success: false,
     error: error.message,
     items: [],
    }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    const {
     organizationId,
     name,
     sku,
     category,
     unit,
     cost,
     price,
    } = body;

    if (!organizationId || !name) {
     return NextResponse.json({
       success: false,
       error: "organizationId and name required",
     }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
     .from("inventory_items")
     .insert({
       organization_id: organizationId,
       name,
       sku,
       category,
       unit,
       cost,
       price,
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
     item: data,
    });

  } catch (error) {
    return NextResponse.json({
     success: false,
     error: error.message,
    }, { status: 500 });
  }
}
