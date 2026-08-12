export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { listProductionYieldLogs } from "@/lib/inventory/production/yield/listProductionYieldLogs";
import processYieldCalculation from "@/lib/inventory/production/yield/processYieldCalculation";

export async function GET(request) {
  try {
    const organizationId =
      request.nextUrl.searchParams.get("organizationId") ||
      request.nextUrl.searchParams.get("organization_id");
    const entityId =
      request.nextUrl.searchParams.get("entityId") ||
      request.nextUrl.searchParams.get("entity_id") ||
      null;

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status },
      );
    }

    const logs = await listProductionYieldLogs({
      organizationId: access.organizationId,
      entityId,
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      logs,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Yield logs load failed" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status },
      );
    }

    const result = await processYieldCalculation({
      ...body,
      organization_id: access.organizationId,
      organizationId: access.organizationId,
      entity_id: body.entity_id || body.entityId || null,
      entityId: body.entity_id || body.entityId || null,
    });

    return NextResponse.json(result, {
      status: result.success ? 200 : 400,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Yield processing failed" },
      { status: 500 },
    );
  }
}
