export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import {
  getGeneralLedger,
} from "@/lib/finance/getGeneralLedger";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedOrganizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");
    const requestedEntityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id");

    if (!requestedOrganizationId) {
      return NextResponse.json(
        { success: false, error: "organization_id required", rows: [] },
        { status: 400 }
      );
    }

    if (!requestedEntityId) {
      return NextResponse.json(
        { success: false, error: "entity_id required", rows: [] },
        { status: 400 }
      );
    }

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, rows: [] },
        { status: access.status }
      );
    }

    const entity = await resolveEntity({
      organizationId: access.organizationId,
      entityId: requestedEntityId,
    });

    if (!entity) {
      return NextResponse.json(
        { success: false, error: "Legal entity not found in organisation", rows: [] },
        { status: 404 }
      );
    }

    const rows = await getGeneralLedger({
      organizationId: access.organizationId,
      entityId: entity.id,
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      entityId: entity.id,
      entries: rows,
      rows,
    });
  } catch (error) {
    console.error("general-ledger GET", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "General Ledger load failed",
        rows: [],
      },
      { status: 500 }
    );
  }
}
