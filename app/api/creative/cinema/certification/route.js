export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  CreativeCinemaEngineCertificationLedgerRuntime,
} from "@/lib/creative/certification/runtime/CreativeCinemaEngineCertificationLedgerRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");
    const projectId =
      searchParams.get("creativeProjectId") ||
      searchParams.get("creative_project_id");

    const access = await requireOrganizationAccess({ organizationId });
    if (!access.success) {
      return NextResponse.json(access, { status: access.status });
    }
    const ledger = await CreativeCinemaEngineCertificationLedgerRuntime.inspect({
      organization_id: organizationId,
      creative_project_id: projectId,
    });

    return NextResponse.json({
      success: true,
      ledger,
      certification: ledger.certification,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error?.message || "Cinema certification unavailable",
    }, {
      status: Number(error?.status) || 400,
    });
  }
}
