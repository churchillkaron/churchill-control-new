export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { CreativePublishingInspectionRuntimeV4 } from "@/lib/creative/release/runtime/CreativePublishingInspectionRuntimeV4";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId") || searchParams.get("organization_id");
    const creativeProjectId = searchParams.get("creativeProjectId") || searchParams.get("creative_project_id");
    if (!organizationId || !creativeProjectId) {
      return NextResponse.json({ success: false, error: "organizationId and creativeProjectId required" }, { status: 400 });
    }
    const access = await requireOrganizationAccess({ organizationId, request: req });
    if (!access.success) return NextResponse.json(access, { status: access.status });
    const publishing = await CreativePublishingInspectionRuntimeV4.inspect({
      organization_id: access.organizationId,
      creative_project_id: creativeProjectId,
    });
    return NextResponse.json({ success: true, publishing });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({
    success: false,
    error: "CREATIVE_LEGACY_PUBLISHING_ENDPOINT_RETIRED_USE_RELEASE_AUTHORITY",
  }, { status: 410 });
}
