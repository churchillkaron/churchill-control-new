import { uploadCreativeAsset }
from "@/lib/creative/assets/storage/uploadCreativeAsset";
import { saveCreativeAsset }
from "@/lib/creative/assets/repositories/saveCreativeAsset";
import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import {
  CreativeFontAssetInspectionRuntime,
} from "./CreativeFontAssetInspectionRuntime";

const CONTRACT = "CREATIVE_FONT_ASSET_INGESTION_V1";

function text(value) {
  return String(value ?? "").trim();
}

export async function createCreativeFontAssetFlow({
  organizationId,
  pageId = null,
  creativeMissionId = null,
  creativeProjectId = null,
  uploadedBy = null,
  file,
  name = null,
} = {}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!file) throw new Error("Creative font file required");

  const inspection = await CreativeFontAssetInspectionRuntime.inspect({ file });
  const upload = await uploadCreativeAsset({
    file,
    organizationId,
    creativeMissionId,
    creativeProjectId,
    uploadedBy,
  });

  if (upload.checksum_sha256 !== inspection.checksum_sha256) {
    throw new Error("CREATIVE_FONT_UPLOAD_CHECKSUM_MISMATCH");
  }
  if (upload.media_kind !== "font") {
    throw new Error("CREATIVE_FONT_UPLOAD_MEDIA_KIND_INVALID");
  }

  const displayName = text(name) || inspection.full_name || upload.original_file_name;
  const technical = {
    mime_type: upload.mime_type,
    checksum: upload.checksum_sha256,
    checksum_sha256: upload.checksum_sha256,
    file_size_bytes: upload.size_bytes,
    original_file_name: upload.original_file_name,
    media_kind: "font",
    font_format: inspection.format,
  };
  const fontMetadata = {
    font_family: inspection.family,
    font_style: inspection.style,
    font_weight: inspection.weight,
    font_full_name: inspection.full_name,
    postscript_name: inspection.postscript_name,
    font_format: inspection.format,
    font_inspection_contract: inspection.contract,
    metadata_verified_from_font_binary: true,
  };

  const asset = await saveCreativeAsset({
    organizationId,
    pageId,
    creativeMissionId,
    assetType: "font",
    name: displayName,
    imageUrl: upload.file_url,
    thumbnailUrl: null,
    aiSuggestedType: null,
    score: 100,
    analysis: {
      type: "font",
      verified: true,
      inspection,
      provider_called: false,
      visual_ai_analysis_used: false,
    },
    metadata: {
      source: "CREATIVE_FONT_UPLOAD",
      creative_project_id: creativeProjectId,
      storage_bucket: upload.bucket,
      storage_path: upload.path,
      signed_url_required: true,
      original_file_name: upload.original_file_name,
      mime_type: upload.mime_type,
      extension: upload.extension,
      media_kind: "font",
      size_bytes: upload.size_bytes,
      checksum_sha256: upload.checksum_sha256,
      uploaded_by: uploadedBy,
      ...fontMetadata,
    },
  });

  const assetNode = await CreativeAssetGraphRuntime.create({
    organization_id: organizationId,
    creative_project_id: creativeProjectId,
    creative_asset_id: asset.id,
    type: CREATIVE_ASSET_NODE_TYPES.FONT,
    status: CREATIVE_ASSET_NODE_STATUS.IMPORTED,
    name: displayName,
    description: `Verified ${inspection.format} font asset: ${inspection.family} ${inspection.style}`,
    url: upload.file_url,
    storage_path: upload.path,
    lineage: {
      source: "customer_upload",
      provider_id: null,
      capability: "creative.font.inspect",
      generation_version: 1,
    },
    technical,
    intelligence: {
      quality_score: 100,
      brand_match_score: null,
      reuse_score: null,
      safety_status: "VERIFIED_BINARY",
      tags: ["font", inspection.format.toLowerCase(), inspection.family],
      detected_products: [],
      detected_people: [],
      detected_locations: [],
    },
    reuse: {
      reusable: true,
      approved_for_reuse: false,
      reuse_count: 0,
    },
    review: {
      ai_reviewed: false,
      human_reviewed: false,
      approved: false,
      approved_by: null,
      notes: "Font binary and identity metadata verified deterministically. Brand approval remains independent of binary validation.",
    },
    metadata: {
      page_id: pageId,
      creative_mission_id: creativeMissionId,
      storage_bucket: upload.bucket,
      storage_path: upload.path,
      signed_url_required: true,
      uploaded_by: uploadedBy,
      ...fontMetadata,
    },
    created_by: uploadedBy,
  });

  return {
    success: true,
    contract: CONTRACT,
    asset,
    asset_node: assetNode,
    upload: {
      bucket: upload.bucket,
      path: upload.path,
      file_url: upload.file_url,
      signed_url_required: true,
      original_file_name: upload.original_file_name,
      mime_type: upload.mime_type,
      extension: upload.extension,
      media_kind: upload.media_kind,
      size_bytes: upload.size_bytes,
      checksum_sha256: upload.checksum_sha256,
      uploaded_at: upload.uploaded_at,
    },
    inspection,
    analysis_status: "VERIFIED_FONT_BINARY",
    visual_ai_analysis_used: false,
    provider_called: false,
  };
}

export default createCreativeFontAssetFlow;
