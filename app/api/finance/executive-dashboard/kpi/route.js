export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const organizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    const entityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id") ||
      searchParams.get("entity_id");

    const periodId =
      searchParams.get("periodId") ||
      searchParams.get("period_id");

    if (!organizationId) {
      return NextResponse.json(
        {
          success: false,
          error: "organizationId required",
        },
        {
          status: 400,
        }
      );
    }

    const mod =
      await import("@/lib/finance/reporting/reports/getExecutiveKPIs");

    const getExecutiveKPIs =
      mod.getExecutiveKPIs ||
      mod.default;

    if (typeof getExecutiveKPIs !== "function") {
      throw new Error("getExecutiveKPIs export not found");
    }

    const result =
      await getExecutiveKPIs({
        organizationId,
        organization_id: organizationId,
        entityId,
        entity_id: entityId,
        entity_id: entityId,
        periodId,
        period_id: periodId,
      });

    const kpis =
      Array.isArray(result)
        ? result
        : result?.kpis ||
          result?.rows ||
          result?.items ||
          [];

    return NextResponse.json({
      success: true,
      kpis,
      rows: kpis,
      summary: result?.summary || result || {},
    });
  } catch (error) {
    console.error("executive-dashboard/kpi GET", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Executive KPI load failed",
      },
      {
        status: 500,
      }
    );
  }
}
