export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { runConsolidation } from "@/lib/finance/intercompany/workflows/runConsolidation";

export async function GET(request) {
  try {
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    const access = await requireOrganizationAccess({ organizationId });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    const { data, error } = await supabaseAdmin
      .from("consolidation_runs")
      .select("*")
      .eq("parent_organization_id", access.organizationId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ success: true, rows: data || [] });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({ organizationId: body.organizationId || body.organization_id });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    const result = await runConsolidation({
      parentOrganizationId: access.organizationId,
      organizationIds: Array.isArray(body.organization_ids || body.organizationIds)
        ? (body.organization_ids || body.organizationIds)
        : String(body.organization_ids || body.organizationIds || access.organizationId)
            .split(",")
            .map(value => value.trim())
            .filter(Boolean),
      reportingPeriod: body.reporting_period || body.period_id,
      startDate: body.start_date,
      endDate: body.end_date,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
