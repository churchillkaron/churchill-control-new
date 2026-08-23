import { NextResponse } from "next/server";

import {
  getLookupOptions,
} from "@/lib/platform/erp-engine/lookups/LookupRuntime";

import {
  resolveEntity,
} from "@/lib/platform/entities/resolveEntity";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export const dynamic = "force-dynamic";

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

function cleanValue(value) {
  const normalized = String(value ?? "").trim();

  if (
    !normalized ||
    normalized === "undefined" ||
    normalized === "null"
  ) {
    return null;
  }

  return normalized;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const requestedOrganizationId = cleanValue(
      searchParams.get("organizationId") ||
      searchParams.get("organization_id")
    );

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
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

    const requestedEntityId = cleanValue(
      searchParams.get("entityId") ||
      searchParams.get("entity_id")
    );

    let entityId = null;

    if (requestedEntityId) {
      const entity = await resolveEntity({
        organizationId: access.organizationId,
        entityId: requestedEntityId,
      });

      if (!entity) {
        return NextResponse.json(
          {
            success: false,
            error: "Entity does not belong to organization",
          },
          {
            status: 403,
          }
        );
      }

      entityId = entity.id;
    }

    const options = await getLookupOptions({
      lookup,
      query: searchParams.get("query") || "",
      context: {
        organizationId: access.organizationId,
        entityId,
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
