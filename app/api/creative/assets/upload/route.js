export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  createCreativeAssetFlow,
} from "@/lib/creative/assets/workflows/createCreativeAssetFlow";

function text(value) {
  return String(value ?? "").trim();
}

function parseObject(value, fallback = {}) {
  const source = text(value);
  if (!source) return fallback;
  const parsed = JSON.parse(source);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("inspection_policy must be a JSON object");
  }
  return parsed;
}

function statusFor(error) {
  const message = text(error?.message).toUpperCase();
  if (
    message.includes("REQUIRED") ||
    message.includes("MISSING") ||
    message.includes("INVALID") ||
    message.includes("UNSUPPORTED") ||
    message.includes("EMPTY") ||
    message.includes("EXCEEDS")
  ) return 400;
  if (message.includes("AUTHENTICATION")) return 401;
  if (message.includes("PERMISSION") || message.includes("MEMBERSHIP")) return 403;
  return 500;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const organizationId = text(
      formData.get("organization_id") || formData.get("organizationId"),
    );

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredAnyPermission: [
        "creative.*",
        "creative.asset.upload",
        "creative.execute",
      ],
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const file = formData.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return Response.json(
        { success: false, error: "Creative asset file required" },
        { status: 400 },
      );
    }
    if (!Number(file.size || 0)) {
      return Response.json(
        { success: false, error: "Creative asset file is empty" },
        { status: 400 },
      );
    }

    const configuredMaximum = Number(
      process.env.CREATIVE_ASSET_MAX_UPLOAD_BYTES || 0,
    );
    if (
      Number.isFinite(configuredMaximum) &&
      configuredMaximum > 0 &&
      Number(file.size) > configuredMaximum
    ) {
      return Response.json(
        {
          success: false,
          error: "Creative asset exceeds configured upload limit",
          file_size_bytes: Number(file.size),
          maximum_size_bytes: configuredMaximum,
        },
        { status: 400 },
      );
    }

    const result = await createCreativeAssetFlow({
      organizationId,
      pageId: text(formData.get("page_id")) || null,
      creativeMissionId: text(formData.get("creative_mission_id")) || null,
      creativeProjectId: text(formData.get("creative_project_id")) || null,
      uploadedBy: access.userId || access.user?.id || null,
      file,
      assetType: text(formData.get("asset_type")) || null,
      name: text(formData.get("name")) || file.name || null,
      inspectionPolicy: parseObject(formData.get("inspection_policy"), {}),
    });

    return Response.json({
      ...result,
      organization_id: organizationId,
      uploaded_by: access.userId || access.user?.id || null,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || String(error),
      },
      { status: statusFor(error) },
    );
  }
}
