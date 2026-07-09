export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { run as ReportingApplicationService } from "@/lib/finance/reporting/runtime/ReportingApplicationService";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const requestedOrganizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    const entityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id");

    if (!requestedOrganizationId) {
      return NextResponse.json(
        { success: false, error: "organizationId required" },
        { status: 400 }
      );
    }

    if (!entityId) {
      return NextResponse.json(
        { success: false, error: "entityId required" },
        { status: 400 }
      );
    }

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const result = await ReportingApplicationService("trial_balance", {
      organization_id: access.organizationId,
      entity_id: entityId,
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("trial-balance GET", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Trial balance failed",
        details: error.details || null,
        hint: error.hint || null,
        code: error.code || null,
      },
      { status: 500 }
    );
  }
}
