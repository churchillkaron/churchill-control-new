import { NextResponse } from "next/server";

import {
  getLookupOptions,
} from "@/lib/platform/erp-engine/lookups/LookupRuntime";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

function accessError(access) {
  return NextResponse.json(
    {
      success: false,
      error: access.error,
    },
    {
      status: access.status,
    }
  );
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const requestedOrganizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
    });

    if (!access.success) {
      return accessError(access);
    }

    const lookup = String(
      searchParams.get("lookup") || ""
    ).trim();

    if (!lookup) {
      return NextResponse.json(
        {
          success: false,
          error: "lookup required",
        },
        {
          status: 400,
        }
      );
    }

    const options = await getLookupOptions({
      lookup,
      query: searchParams.get("query") || "",
      context: {
        organizationId: access.organizationId,
        entityId:
          searchParams.get("entityId") ||
          searchParams.get("entity_id") ||
          null,
      },
    });

    return NextResponse.json(options || []);
  } catch (error) {
    console.error("LOOKUP API ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Lookup failed",
      },
      {
        status: 500,
      }
    );
  }
}
