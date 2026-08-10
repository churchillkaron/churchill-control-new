import { NextResponse } from "next/server";

import {
  resolveDetailReadModel,
} from "@/lib/platform/read-model/resolveDetailReadModel";
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

export async function POST(request) {
  try {
    const body = await request.json();
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const rowOrganizationIds = [
      ...new Set(
        rows
          .map(row => String(row?.organization_id || "").trim())
          .filter(Boolean)
      ),
    ];
    const requestedOrganizationId =
      body?.organizationId ||
      body?.organization_id ||
      (rowOrganizationIds.length === 1 ? rowOrganizationIds[0] : null);

    if (rowOrganizationIds.length > 1) {
      return NextResponse.json(
        {
          success: false,
          error: "READ_MODEL_MULTIPLE_ORGANIZATIONS_NOT_ALLOWED",
        },
        {
          status: 400,
        }
      );
    }

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
    });

    if (!access.success) {
      return accessError(access);
    }

    const resolved = await Promise.all(
      rows.map(row =>
        resolveDetailReadModel({
          row,
          organizationId: access.organizationId,
        })
      )
    );

    return NextResponse.json({
      success: true,
      rows: resolved,
    });
  } catch (error) {
    const message = error?.message || "Read model resolution failed";
    const status =
      message === "READ_MODEL_ORGANIZATION_MISMATCH"
        ? 403
        : 500;

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status,
      }
    );
  }
}
