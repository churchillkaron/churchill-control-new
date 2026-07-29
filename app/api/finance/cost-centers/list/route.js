export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { listFinanceCostCenters } from "@/lib/finance/cost-centers/CostCenterPolicy";

async function respond(request, body = {}) {
  try {
    const url = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        body.organizationId ||
        body.organization_id ||
        url.searchParams.get("organizationId") ||
        url.searchParams.get("organization_id"),
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const entityId =
      body.entityId ||
      body.entity_id ||
      url.searchParams.get("entityId") ||
      url.searchParams.get("entity_id");
    const includeInactive =
      body.includeInactive === true ||
      body.include_inactive === true ||
      url.searchParams.get("includeInactive") === "true" ||
      url.searchParams.get("include_inactive") === "true";

    const rows = await listFinanceCostCenters({
      organizationId: access.organizationId,
      entityId,
      includeInactive,
    });

    return NextResponse.json({
      success: true,
      costCenters: rows,
      rows,
      active: rows.filter(row => row.is_active !== false).length,
      inactive: rows.filter(row => row.is_active === false).length,
    });
  } catch (error) {
    const message = error?.message || "Cost Centres could not be loaded";
    return NextResponse.json(
      { success: false, error: message },
      { status: /required|outside|inactive|entity/i.test(message) ? 400 : 500 }
    );
  }
}

export async function GET(request) {
  return respond(request);
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  return respond(request, body);
}
