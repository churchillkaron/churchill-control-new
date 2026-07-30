export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { runEventProcessors } from "@/lib/workers/system/runEventProcessors";

function readValue(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const requestedOrganizationId = readValue(
      body,
      "organizationId",
      "organization_id"
    );
    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 }
      );
    }

    const mode = body.mode || "manual";
    const result = await runEventProcessors({
      organizationId: access.organizationId,
      eventId: body.eventId || body.event_id || null,
      limit: Math.max(1, Math.min(Number(body.limit || 50), 200)),
    });

    return NextResponse.json(
      {
        success: result.success,
        mode,
        organizationId: access.organizationId,
        result,
      },
      { status: result.success ? 200 : 409 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Event processing failed",
      },
      { status: 500 }
    );
  }
}
