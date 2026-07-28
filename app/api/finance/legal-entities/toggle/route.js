export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  toggleLegalEntityCommand,
} from "@/lib/finance/legal-entities/runtime/LegalEntityApplicationService";

function requestedState(body) {
  if (body.is_active === undefined && body.active === undefined) {
    return false;
  }

  const value = body.is_active ?? body.active;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on", "active"].includes(
    String(value).trim().toLowerCase()
  );
}

export async function POST(request) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const result = await toggleLegalEntityCommand({
      organization_id: access.organizationId,
      entity_id: body.entity_id || body.id,
      is_active: requestedState(body),
      updated_by: user?.id || access.user?.id || null,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error?.message || "Legal Entity lifecycle update failed";
    const status = /required|not found|cannot|close all|deactivate|reassign/i.test(
      message
    )
      ? 400
      : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
