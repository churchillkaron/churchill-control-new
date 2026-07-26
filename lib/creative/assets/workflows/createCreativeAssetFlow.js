import { uploadCreativeAsset }
from "@/lib/creative/assets/storage/uploadCreativeAsset";
import { analyzeCreativeAsset }
from "@/lib/creative/assets/intelligence/analyzeCreativeAsset";
import { saveCreativeAsset }
from "@/lib/creative/assets/repositories/saveCreativeAsset";
import { analyzeCreativeSubject }
from "@/lib/creative/assets/intelligence/analyzeCreativeSubject";
import { calculateAssetScore }
from "@/lib/ai/scoring/calculateAssetScore";
import { getOrCreateBusinessProfile }
from "@/lib/ai/profiles/getOrCreateBusinessProfile";
import {
  CreativeMediaInspectionRuntime,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";

function text(value) {
  return String(value || "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeAssetType({ requested, analysis, mediaKind }) {
  const explicit = text(requested).toLowerCase();
  if (explicit) return explicit;
  const inferred = text(analysis?.scene_type).toLowerCase();
  if (inferred && inferred !== "unknown") return inferred;
  return mediaKind || "file";
}

function graphNodeType(mediaKind, assetType) {
  const kind = text(mediaKind).toLowerCase();
  const type = text(assetType).toLowerCase();
  if (type === "logo") return CREATIVE_ASSET_NODE_TYPES.LOGO;
  if (type === "font") return CREATIVE_ASSET_NODE_TYPES.FONT;
  if (type === "template") return CREATIVE_ASSET_NODE_TYPES.TEMPLATE;
  if (kind === "image") return CREATIVE_ASSET_NODE_TYPES.IMAGE;
  if (kind === "video") return CREATIVE_ASSET_NODE_TYPES.VIDEO;
  if (kind === "audio") return CREATIVE_ASSET_NODE_TYPES.AUDIO;
  return CREATIVE_ASSET_NODE_TYPES.ASSET;
}

function technicalEvidence(inspection, upload) {
  return {
    ...object(inspection?.technical),
    mime_type:
      inspection?.technical?.mime_type ||
      upload.mime_type ||
      null,
    checksum:
      inspection?.technical?.checksum_sha256 ||
      upload.checksum_sha256 ||
      null,
    checksum_sha256:
      inspection?.technical?.checksum_sha256 ||
      upload.checksum_sha256 ||
      null,
    file_size_bytes:
      inspection?.technical?.file_size_bytes ||
      upload.size_bytes ||
      null,
    original_file_name:
      inspection?.technical?.original_file_name ||
      upload.original_file_name ||
      null,
  };
}

function intelligenceEvidence(analysis, score) {
  const anchors = object(analysis?.continuity_anchors);
  return {
    quality_score: Number(score || 0),
    brand_match_score: Number(analysis?.brand_relevance_score || 0),
    reuse_score: Number(analysis?.reuse_score || 0),
    safety_status:
      analysis?.status === "VERIFIED" ? "REVIEW_REQUIRED" : "UNVERIFIED",
    tags: list(analysis?.tags),
    detected_products: list(analysis?.visible_inventory?.products || anchors.products),
    detected_people: list(analysis?.visible_inventory?.people || anchors.people),
    detected_locations: list(analysis?.visible_inventory?.locations || anchors.locations),
    analysis_status: analysis?.status || "UNVERIFIED",
    confidence: Number(analysis?.asset_confidence || 0),
    continuity_anchors: anchors,
    rights_risks: list(analysis?.rights_risks),
    consent_risks: list(analysis?.consent_risks),
    privacy_risks: list(analysis?.privacy_risks),
  };
}

export async function createCreativeAssetFlow({
  organizationId,
  pageId = null,
  creativeMissionId = null,
  creativeProjectId = null,
  uploadedBy = null,
  file,
  assetType = null,
  name = null,
  inspectionPolicy = {},
} = {}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!file) throw new Error("Creative asset file required");

  const inspection = await CreativeMediaInspectionRuntime.inspect({
    file,
    file_name: file.name || name || null,
    mime_type: file.type || null,
    policy: inspectionPolicy,
  });

  const upload = await uploadCreativeAsset({
    file,
    organizationId,
    creativeMissionId,
    creativeProjectId,
    uploadedBy,
  });

  const technical = technicalEvidence(inspection, upload);
  const businessProfile = await getOrCreateBusinessProfile({
    organizationId,
  });

  const analysis = await analyzeCreativeAsset({
    organizationId,
    fileUrl: upload.inspection_url,
    assetType,
    mediaKind: technical.media_kind || upload.media_kind,
    mimeType: technical.mime_type || upload.mime_type,
    technicalInspection: technical,
    businessProfile,
  });

  let identityData = null;
  const personRequested = text(assetType).toLowerCase() === "person";
  const verifiedImage =
    (technical.media_kind || upload.media_kind) === "image" &&
    analysis.status === "VERIFIED";

  if (personRequested && verifiedImage) {
    identityData = await analyzeCreativeSubject({
      imageUrl: upload.inspection_url,
      organizationId,
    });
  }

  const resolvedAssetType = normalizeAssetType({
    requested: assetType,
    analysis,
    mediaKind: technical.media_kind || upload.media_kind,
  });

  const enrichedAnalysis = {
    ...analysis,
    identity: identityData,
    technical_inspection: {
      status: inspection.status,
      reason: inspection.reason || null,
      ...technical,
    },
    storage_evidence: {
      bucket: upload.bucket,
      path: upload.path,
      signed_url_required: true,
      original_file_name: upload.original_file_name,
      mime_type: upload.mime_type,
      extension: upload.extension,
      media_kind: upload.media_kind,
      size_bytes: upload.size_bytes,
      checksum_sha256: upload.checksum_sha256,
      uploaded_at: upload.uploaded_at,
    },
  };

  const score = analysis.status === "VERIFIED"
    ? calculateAssetScore({ analysis: enrichedAnalysis })
    : 0;

  const asset = await saveCreativeAsset({
    organizationId,
    pageId,
    creativeMissionId,
    assetType: resolvedAssetType,
    name: name || upload.original_file_name,
    imageUrl: upload.file_url,
    thumbnailUrl: null,
    aiSuggestedType: analysis.status === "VERIFIED"
      ? text(analysis.scene_type) || null
      : null,
    score,
    analysis: {
      ...enrichedAnalysis,
      score,
    },
    metadata: {
      source: "CREATIVE_ASSET_UPLOAD",
      creative_project_id: creativeProjectId,
      storage_bucket: upload.bucket,
      storage_path: upload.path,
      signed_url_required: true,
      original_file_name: upload.original_file_name,
      mime_type: upload.mime_type,
      extension: upload.extension,
      media_kind: technical.media_kind || upload.media_kind,
      size_bytes: upload.size_bytes,
      checksum_sha256: upload.checksum_sha256,
      analysis_status: analysis.status,
      inspection_status: inspection.status,
      inspection_reason: inspection.reason || null,
      uploaded_by: uploadedBy,
    },
  });

  const assetNode = await CreativeAssetGraphRuntime.create({
    organization_id: organizationId,
    creative_project_id: creativeProjectId,
    creative_asset_id: asset.id,
    type: graphNodeType(technical.media_kind || upload.media_kind, resolvedAssetType),
    status: CREATIVE_ASSET_NODE_STATUS.IMPORTED,
    name: asset.name || upload.original_file_name || "Imported creative asset",
    description: analysis.description || "",
    url: upload.file_url,
    storage_path: upload.path,
    lineage: {
      source: "customer_upload",
      provider_id: null,
      capability: "creative.asset.inspect",
      generation_version: 1,
    },
    technical,
    intelligence: intelligenceEvidence(analysis, score),
    reuse: {
      reusable: false,
      approved_for_reuse: false,
      reuse_count: 0,
    },
    review: {
      ai_reviewed: analysis.status === "VERIFIED",
      human_reviewed: false,
      approved: false,
      approved_by: null,
      notes: "Reuse remains blocked until explicit rights, consent and human approval are recorded.",
    },
    metadata: {
      page_id: pageId,
      creative_mission_id: creativeMissionId,
      storage_bucket: upload.bucket,
      storage_path: upload.path,
      signed_url_required: true,
      analysis_status: analysis.status,
      inspection_status: inspection.status,
      inspection_reason: inspection.reason || null,
      rights: object(analysis.rights),
      consent: object(analysis.consent),
      restrictions: object(analysis.restrictions),
      uploaded_by: uploadedBy,
    },
    created_by: uploadedBy,
  });

  return {
    success: true,
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
    inspection: {
      status: inspection.status,
      reason: inspection.reason || null,
      technical,
    },
    analysis_status: analysis.status,
  };
}
