export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({ organizationId: body.organizationId || body.organization_id });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    const { data, error } = await supabaseAdmin.from("cost_centers").update({
      code: body.code,
      name: body.name,
      type: body.type || null,
      manager: body.manager || null,
      updated_at: new Date().toISOString(),
    }).eq("id", body.id).eq("organization_id", access.organizationId).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, costCenter: data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

