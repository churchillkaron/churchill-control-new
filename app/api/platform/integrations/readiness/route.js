export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  checkBusinessConnectionPlatformReadiness,
  listBusinessConnections,
} from "@/lib/platform/channels/BusinessConnectionRegistry";
import { requirePlatformOperatorWorkspaceAccess } from "@/lib/platform/security/requirePlatformOperatorWorkspaceAccess";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId =
      url.searchParams.get("organizationId") ||
      url.searchParams.get("organization_id");
    const access = await requirePlatformOperatorWorkspaceAccess({ organizationId });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error || "Platform access denied" },
        { status: access.status || 403 },
      );
    }

    const rows = listBusinessConnections().map((connection) => {
      const readiness = checkBusinessConnectionPlatformReadiness(connection);
      return {
        id: connection.id,
        name: connection.name,
        authModel: readiness.authModel,
        ready: readiness.ready,
        missingConfiguration: readiness.missing,
      };
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      rows,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Integration readiness check failed" },
      { status: 500 },
    );
  }
}
