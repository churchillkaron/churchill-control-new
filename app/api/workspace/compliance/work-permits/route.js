export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { listOrganizationWorkPermitCompliance } from "@/lib/people/workforce/StaffWorkPermitRuntime";

function clean(value, limit = 160) {
  return String(value ?? "").trim().slice(0, limit);
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const entityId = clean(url.searchParams.get("entityId") || url.searchParams.get("entity_id")) || null;
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });
    }

    const rows = await listOrganizationWorkPermitCompliance({ organizationId: access.organizationId, entityId });
    const expiringSoon = rows.filter((row) => row.status === "EXPIRING_SOON");
    const expired = rows.filter((row) => row.status === "EXPIRED");
    const pending = rows.filter((row) => String(row.status || "").toUpperCase() === "PENDING");

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      entityId,
      generatedAt: new Date().toISOString(),
      summary: {
        total: rows.length,
        expiringSoon: expiringSoon.length,
        expired: expired.length,
        pending: pending.length,
      },
      workPermits: rows,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to load work permit compliance" }, { status: error?.status || 500 });
  }
}
