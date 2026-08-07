export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { runEventProcessors } from "@/lib/workers/system/runEventProcessors";

function normalizeOrganizationId(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = normalizeOrganizationId(
      body.organizationId || body.organization_id,
    );

    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: "organizationId is required" },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    const result = await runEventProcessors({
      organizationId,
      limit: Math.max(1, Math.min(Number(body.limit || 50), 200)),
    });

    return NextResponse.json(
      {
        success: result.success !== false,
        organization_id: organizationId,
        result,
      },
      { status: result.success === false ? 500 : 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Work center event recovery failed",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: "Use authenticated POST with organizationId",
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}
