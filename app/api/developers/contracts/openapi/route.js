import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { DEVELOPER_API_VERSION } from "@/lib/developer/DeveloperApiContract";
import { requireDeveloperPortalAccess } from "@/lib/developer/DeveloperPortalRuntime";
import { buildDeveloperOpenApi } from "@/lib/developer/DeveloperContractExportRuntime";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organization_id") || url.searchParams.get("organizationId");
  const access = await requireDeveloperPortalAccess({ organizationId, request });
  if (!access.success) {
    return NextResponse.json({ success: false, error: access.error || "Developer access required" }, { status: access.status || 403 });
  }
  const origin = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const spec = buildDeveloperOpenApi({ origin });
  const body = JSON.stringify(spec, null, 2);
  const digest = createHash("sha256").update(body).digest("hex");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="avantiqo-openapi.json"',
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-avantiqo-api-version": DEVELOPER_API_VERSION,
      "x-avantiqo-contract-sha256": digest,
      "etag": `"sha256-${digest}"`,
    },
  });
}
