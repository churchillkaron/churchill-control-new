export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { uploadMarketingAssetFlow }
from "@/lib/marketing/services/uploadMarketingAssetFlow";

import { requireOrganizationAccess }
from "@/lib/platform/security/requireOrganizationAccess";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

function parseJson(value, fallback) {
  if (!value) return fallback;

  try {
    return JSON.parse(String(value));
  } catch {
    const error = new Error("Invalid JSON form field");
    error.status = 400;
    throw error;
  }
}

function statusFor(error) {
  const explicit = Number(error?.status || 0);
  if (explicit >= 400 && explicit <= 599) return explicit;
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("required") || message.includes("missing") || message.includes("invalid") || message.includes("empty") || message.includes("exceeds") || message.includes("must be")) return 400;
  if (message.includes("not found")) return 404;
  return 500;
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
    if (!Number(file.size || 0)) {
      return Response.json(
        { success: false, error: "Marketing asset file is empty" },
        { status: 400 },
      );
    }
    const configuredMaximum = Number(process.env.CREATIVE_ASSET_MAX_UPLOAD_BYTES || 0);
    if (Number.isFinite(configuredMaximum) && configuredMaximum > 0 && Number(file.size) > configuredMaximum) {
      return Response.json(
        {
          success: false,
          error: "Marketing asset exceeds configured upload limit",
          file_size_bytes: Number(file.size),
          maximum_size_bytes: configuredMaximum,
        },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredAnyPermission: [
        "marketing.campaign.manage",
        "creative.asset.upload",
        "creative.*",
      ],
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const campaignId = formData.get("campaignId") || null;
    const creativeMissionId = formData.get("creativeMissionId") || null;
    const creativeProjectId = formData.get("creativeProjectId") || null;
    if (campaignId && !["image/", "video/"].some((prefix) => String(file.type || "").toLowerCase().startsWith(prefix))) {
      return Response.json(
        { success: false, error: "Campaign media must be an image or video" },
        { status: 400 },
      );
    }
    if (campaignId) {
      const { data: campaign, error: campaignError } = await supabaseAdmin
        .from("marketing_campaigns")
        .select("id")
        .eq("id", campaignId)
        .eq("organization_id", access.organizationId)
        .maybeSingle();
      if (campaignError) throw campaignError;
      if (!campaign) {
        return Response.json(
          { success: false, error: "Campaign not found for this organization" },
          { status: 404 },
        );
      }
    }

    if (creativeMissionId) {
      const { data: mission, error: missionError } = await supabaseAdmin
        .from("creative_missions")
        .select("id")
        .eq("id", creativeMissionId)
        .eq("organization_id", access.organizationId)
        .maybeSingle();
      if (missionError) throw missionError;
      if (!mission) {
        return Response.json(
          { success: false, error: "Creative mission not found for this organization" },
          { status: 404 },
        );
      }
    }

    if (creativeProjectId) {
      const { data: project, error: projectError } = await supabaseAdmin
        .from("creative_projects")
        .select("id")
        .eq("id", creativeProjectId)
        .eq("organization_id", access.organizationId)
        .maybeSingle();
      if (projectError) throw projectError;
      if (!project) {
        return Response.json(
          { success: false, error: "Creative project not found for this organization" },
          { status: 404 },
        );
      }
    }

    const result = await uploadMarketingAssetFlow({
      organizationId: access.organizationId,
      pageId: formData.get("pageId") || null,
      creativeMissionId,
      creativeProjectId,
      campaignId,
      file,
      assetType: formData.get("assetType") || null,
      name: formData.get("name") || null,
      source: formData.get("source") || "upload",
      restrictions: parseJson(formData.get("restrictions"), {}),
    });

    return Response.json(result);
  } catch (error) {
    const status = statusFor(error);
    console.error("MARKETING ASSET UPLOAD ERROR:", error);
    return Response.json(
      {
        success: false,
        error: status < 500 ? error.message : "Unable to upload marketing asset",
      },
      { status },
    );
  }
}
