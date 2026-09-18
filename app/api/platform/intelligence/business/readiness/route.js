import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getPublicBusinessDiagnosisReadiness } from "@/lib/intelligence/runtime/AvantiqoBusinessDiagnosisReadinessRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value) {
  return String(value ?? "").trim();
}

export async function GET(request) {
  try {
    const organizationId = text(new URL(request.url).searchParams.get("organization_id"));
    if (!organizationId) {
      return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    }
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }
    const readiness = getPublicBusinessDiagnosisReadiness();
    return NextResponse.json({ success: readiness.ready, organization_id: access.organizationId, readiness }, {
      status: readiness.ready ? 200 : 503,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Business diagnosis readiness failed" }, {
      status: 500,
      headers: { "cache-control": "no-store" },
    });
  }
}
