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
      entity_id: body.entityId || body.entity_id,
      account_code: body.account_code,
      account_name: body.account_name,
      account_category: body.account_category || null,
      account_type: body.account_type,
      normal_balance: body.normal_balance || null,
      currency_code: body.currency_code || "THB",
    };
    const query = body.id
      ? supabaseAdmin.from("chart_of_accounts").update(values).eq("id", body.id).eq("organization_id", access.organizationId)
      : supabaseAdmin.from("chart_of_accounts").insert(values);
    const { data, error } = await query.select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, account: data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

