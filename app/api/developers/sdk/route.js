import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { DEVELOPER_API_VERSION } from "@/lib/developer/DeveloperApiContract";
import { requireDeveloperPortalAccess } from "@/lib/developer/DeveloperPortalRuntime";
import {
  generatePythonSdk,
  generateTypeScriptSdk,
} from "@/lib/developer/DeveloperContractExportRuntime";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organization_id") || url.searchParams.get("organizationId");
  const access = await requireDeveloperPortalAccess({ organizationId, request });
  if (!access.success) {
    return NextResponse.json({ success: false, error: access.error || "Developer access required" }, { status: access.status || 403 });
  }
  const language = String(url.searchParams.get("language") || "typescript").toLowerCase();
  if (!["typescript", "python"].includes(language)) {
    return NextResponse.json(
      { success: false, error: "language must be typescript or python" },
      { status: 400, headers: { "cache-control": "private, no-store" } },
    );
  }

  const python = language === "python";
  const body = python ? generatePythonSdk() : generateTypeScriptSdk();
  const filename = python ? "avantiqo.py" : "avantiqo.ts";
  const digest = createHash("sha256").update(body).digest("hex");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": python ? "text/x-python; charset=utf-8" : "text/typescript; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-avantiqo-api-version": DEVELOPER_API_VERSION,
      "x-avantiqo-contract-sha256": digest,
      "etag": `"sha256-${digest}"`,
    },
  });
}
