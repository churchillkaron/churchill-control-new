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
    const row = body?.row || null;
    const requestedOrganizationId =
      body?.organizationId ||
      body?.organization_id ||
      row?.organization_id ||
      null;

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
    });

    if (!access.success) {
      return accessError(access);
    }

    const resolved = await resolveDetailReadModel({
      row,
      organizationId: access.organizationId,
    });

    return NextResponse.json({
      success: true,
      row: resolved,
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
