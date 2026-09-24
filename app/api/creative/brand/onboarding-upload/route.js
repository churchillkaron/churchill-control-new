export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import sharp from "sharp";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { uploadCreativeAsset } from "@/lib/creative/assets/storage/uploadCreativeAsset";
import * as CreativeAssetRepository from "@/lib/creative/assets/repositories/CreativeAssetRepository";
import { CreativeBrandBootstrapRuntime } from "@/lib/creative/brand/runtime/CreativeBrandBootstrapRuntime";
import { syncOrganizationHostnameBranding } from "@/lib/platform/context/OrganizationHostnameBrandRuntime";

function text(value) { return String(value ?? "").trim(); }

async function saveBrandAsset({ file, organizationId, uploadedBy, role }) {
  if (!file || typeof file.arrayBuffer !== "function" || !Number(file.size || 0)) return null;
  const mime = text(file.type).toLowerCase();
  if (!mime.startsWith("image/")) throw new Error(`${role}_MUST_BE_IMAGE`);
  if (Number(file.size) > 10 * 1024 * 1024) throw new Error(`${role}_EXCEEDS_10_MB`);

  if (role === "LOGO_ICON") {
    const bytes = Buffer.from(await file.arrayBuffer());
    const info = await sharp(bytes, { failOn: "none" }).metadata();
    const width = Number(info.width || 0);
    const height = Number(info.height || 0);
    if (width > 0 && height > 0) {
      const ratio = width / height;
      if (ratio < 0.72 || ratio > 1.38) {
        throw new Error("LOGO_ICON_MUST_BE_COMPACT");
      }
    }
  }

  const upload = await uploadCreativeAsset({ file, organizationId, uploadedBy });
  return CreativeAssetRepository.create({
    organization_id: organizationId,
    asset_type: "LOGO",
    file_url: upload.file_url,
    image_url: upload.file_url,
    file_name: upload.original_file_name,
    name: role === "PRIMARY_LOGO" ? "Primary Logo" : "Logo Icon",
    description: role === "PRIMARY_LOGO"
      ? "Organization primary brand logo uploaded during onboarding."
      : "Organization compact logo/icon uploaded during onboarding.",
    tags: ["BRAND", role],
    ai_generated: false,
    created_by: uploadedBy,
    metadata: {
      source: "ORGANIZATION_ONBOARDING",
      brand_asset_role: role,
      storage_bucket: upload.bucket,
      storage_path: upload.path,
      signed_url_required: true,
      original_file_name: upload.original_file_name,
      mime_type: upload.mime_type,
      checksum_sha256: upload.checksum_sha256,
      ownership: { type: "ORGANIZATION_UPLOAD" },
    },
  });
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const organizationId = text(formData.get("organizationId") || formData.get("organization_id"));
    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredAnyPermission: ["creative.asset.upload", "creative.*"],
    });
    if (!access.success) return Response.json(access, { status: access.status || 403 });

    const [primaryLogo, logoIcon] = await Promise.all([
      saveBrandAsset({
        file: formData.get("primary_logo"),
        organizationId: access.organizationId,
        uploadedBy: access.userId || access.user?.id || null,
        role: "PRIMARY_LOGO",
      }),
      saveBrandAsset({
        file: formData.get("logo_icon"),
        organizationId: access.organizationId,
        uploadedBy: access.userId || access.user?.id || null,
        role: "LOGO_ICON",
      }),
    ]);

    if (!primaryLogo && !logoIcon) {
      return Response.json({ success:false, error:"Upload a primary logo or logo icon" }, { status:400 });
    }

    const result = await CreativeBrandBootstrapRuntime.bootstrap({
      organizationId: access.organizationId,
      primaryLogoAssetId: primaryLogo?.id || null,
      logoIconAssetId: logoIcon?.id || null,
    });

    let hostnameBrandSync = { updated:0 };
    let hostnameBrandSyncWarning = null;
    try {
      hostnameBrandSync = await syncOrganizationHostnameBranding({ organizationId:access.organizationId });
    } catch (syncError) {
      hostnameBrandSyncWarning = syncError?.message || "Hostname branding could not be synchronized";
    }

    return Response.json({
      success:true,
      primary_logo_asset: primaryLogo,
      logo_icon_asset: logoIcon,
      hostname_brand_sync:hostnameBrandSync,
      hostname_brand_sync_warning:hostnameBrandSyncWarning,
      ...result,
    });
  } catch (error) {
    const code = error?.message || "Brand onboarding failed";
    const message = code === "LOGO_ICON_MUST_BE_COMPACT"
      ? "Logo Icon / Compact Mark must be square or near-square. Upload the compact symbol, not the full horizontal wordmark."
      : code;
    const status = /MUST_BE_IMAGE|MUST_BE_COMPACT|EXCEEDS|Upload a primary|square or near-square/i.test(message) ? 400 : 500;
    return Response.json({ success:false, error:message }, { status });
  }
}
