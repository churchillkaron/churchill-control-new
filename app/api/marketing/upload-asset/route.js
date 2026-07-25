export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { uploadMarketingAssetFlow }
from "@/lib/marketing/services/uploadMarketingAssetFlow";

import { requireOrganizationAccess }
from "@/lib/platform/security/requireOrganizationAccess";

function parseJson(value, fallback) {
  if (!value) return fallback;

  try {
    return JSON.parse(String(value));
  } catch {
    throw new Error("Invalid JSON form field");
  }
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const organizationId = formData.get("organizationId");
    const file = formData.get("file");

    if (!organizationId) {
      return Response.json(
        { success: false, error: "Missing organizationId" },
        { status: 400 },
      );
    }

    if (!file || typeof file.arrayBuffer !== "function") {
      return Response.json(
        { success: false, error: "Missing or invalid file" },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({ organizationId });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const result = await uploadMarketingAssetFlow({
      organizationId,
      pageId: formData.get("pageId") || null,
      creativeMissionId: formData.get("creativeMissionId") || null,
      creativeProjectId: formData.get("creativeProjectId") || null,
      campaignId: formData.get("campaignId") || null,
      file,
      assetType: formData.get("assetType") || null,
      name: formData.get("name") || null,
      source: formData.get("source") || "upload",
      restrictions: parseJson(formData.get("restrictions"), {}),
    });

    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 },
    );
  }
}
