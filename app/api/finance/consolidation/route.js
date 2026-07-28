export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { runConsolidation } from "@/lib/finance/intercompany/workflows/runConsolidation";

const MISSING_RELATION_CODES = new Set(["42P01", "PGRST204", "PGRST205"]);
const CONSOLIDATION_TABLES = [
  "finance_consolidation_runs",
  "consolidation_runs",
];

function organizationIdFrom(value = {}) {
  return value.organizationId || value.organization_id || null;
}

function entityIdsFrom(value = {}) {
  const raw = value.entityIds || value.entity_ids || [];
  const values = Array.isArray(raw)
    ? raw
    : String(raw || "")
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);

  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
}

async function readConsolidationRuns(organizationId) {
  for (const table of CONSOLIDATION_TABLES) {
    const parentColumn = table === "consolidation_runs"
      ? "parent_organization_id"
      : "organization_id";

    const { data, error } = await supabaseAdmin
      .from(table)
      .select("*")
      .eq(parentColumn, organizationId)
      .order("created_at", { ascending: false });

    if (!error) {
      return {
        rows: data || [],
        sourceTable: table,
      };
    }

    if (!MISSING_RELATION_CODES.has(String(error.code || ""))) {
      throw error;
    }
  }

  return {
    rows: [],
    sourceTable: null,
  };
}

export async function GET(request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const result = await readConsolidationRuns(access.organizationId);

    return NextResponse.json({
      success: true,
      rows: result.rows,
      sourceTable: result.sourceTable,
      unavailable: result.sourceTable === null,
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
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const entityIds = entityIdsFrom(body);
    if (entityIds.length < 2) {
      throw new Error("Consolidation requires at least two explicitly selected legal entities");
    }

    const periodId = body.periodId || body.period_id || null;
    const startDate = body.startDate || body.start_date || null;
    const endDate = body.endDate || body.end_date || null;

    if (!periodId && (!startDate || !endDate)) {
      throw new Error(
        "Consolidation requires an accounting period or explicit start and end dates"
      );
    }

    const result = await runConsolidation({
      organizationId: access.organizationId,
      entityIds,
      periodId,
      reportingPeriod:
        body.reportingPeriod || body.reporting_period || null,
      startDate,
      endDate,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const status = /required|outside|cannot|must|requires|at least|explicit/i.test(
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
