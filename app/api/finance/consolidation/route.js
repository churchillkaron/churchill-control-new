export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { runConsolidation } from "@/lib/finance/intercompany/workflows/runConsolidation";

function organizationIdFrom(value = {}) {
  return value.organizationId || value.organization_id || null;
}

function entityIdsFrom(value = {}) {
  const raw = value.entityIds || value.entity_ids || [];

  return Array.isArray(raw)
    ? raw
    : String(raw || "")
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);
}

export async function GET(request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("consolidation_runs")
      .select("*")
      .eq("parent_organization_id", access.organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      rows: data || [],
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: organizationIdFrom(body),
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const result = await runConsolidation({
      organizationId: access.organizationId,
      entityIds: entityIdsFrom(body),
      periodId: body.periodId || body.period_id || null,
      reportingPeriod:
        body.reportingPeriod || body.reporting_period || null,
      startDate: body.startDate || body.start_date || null,
      endDate: body.endDate || body.end_date || null,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const status = /required|outside|cannot|must|requires/i.test(
      String(error.message || "")
    )
      ? 400
      : 500;

    return NextResponse.json(
      { success: false, error: error.message },
      { status }
    );
  }
}
