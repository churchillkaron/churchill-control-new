export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({ organizationId: body.organizationId || body.organization_id });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const values = {
      organization_id: access.organizationId,
      code: String(body.code || "").toUpperCase(),
      name: body.name,
      symbol: body.symbol || null,
      decimal_places: Number(body.decimal_places ?? 2),
    };
    const query = body.id
      ? supabaseAdmin.from("currencies").update(values).eq("id", body.id).eq("organization_id", access.organizationId)
      : supabaseAdmin.from("currencies").insert(values);
    const { data, error } = await query.select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, currency: data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

