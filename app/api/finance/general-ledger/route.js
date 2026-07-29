export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  getGeneralLedger,
} from "@/lib/finance/getGeneralLedger";

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

    const rows = await getGeneralLedger({
      organizationId: access.organizationId,
      entityId,
      accountId:
        searchParams.get("accountId") ||
        searchParams.get("account_id") ||
        null,
      startDate:
        searchParams.get("startDate") ||
        searchParams.get("start_date") ||
        null,
      endDate:
        searchParams.get("endDate") ||
        searchParams.get("end_date") ||
        null,
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      entityId,
      count: rows.length,
      rows,
      entries: rows,
    });
  } catch (error) {
    console.error("general-ledger GET", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "General Ledger load failed",
        code: error.code || null,
        details: error.details || null,
        hint: error.hint || null,
      },
      { status: 500 }
    );
  }
}
