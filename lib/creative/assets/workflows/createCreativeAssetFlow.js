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

function text(value) {
  return String(value || "").trim();
}

function normalizeAssetType({ requested, analysis, mediaKind }) {
  const explicit = text(requested).toLowerCase();
  if (explicit) return explicit;
  const inferred = text(analysis?.scene_type).toLowerCase();
  if (inferred && inferred !== "unknown") return inferred;
  return mediaKind || "file";
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
} = {}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!file) throw new Error("Creative asset file required");

  const upload = await uploadCreativeAsset({
    file,
    organizationId,
    creativeMissionId,
    creativeProjectId,
    uploadedBy,
  });

  const businessProfile = await getOrCreateBusinessProfile({
    organizationId,
  });

  const analysis = await analyzeCreativeAsset({
    organizationId,
    fileUrl: upload.file_url,
    assetType,
    mediaKind: upload.media_kind,
    mimeType: upload.mime_type,
    technicalInspection: {
      size_bytes: upload.size_bytes,
      checksum_sha256: upload.checksum_sha256,
      extension: upload.extension,
    },
    businessProfile,
  });

  let identityData = null;
  const personRequested = text(assetType).toLowerCase() === "person";
  const verifiedImage =
    upload.media_kind === "image" &&
    analysis.status === "VERIFIED";

  if (personRequested && verifiedImage) {
    identityData = await analyzeCreativeSubject({
      imageUrl: upload.file_url,
      organizationId,
    });
  }

  const resolvedAssetType = normalizeAssetType({
    requested: assetType,
    analysis,
    mediaKind: upload.media_kind,
  });

  const enrichedAnalysis = {
    ...analysis,
    identity: identityData,
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
      media_kind: upload.media_kind,
      size_bytes: upload.size_bytes,
      checksum_sha256: upload.checksum_sha256,
      analysis_status: analysis.status,
    },
  });

  return {
    success: true,
    asset,
    upload,
    analysis_status: analysis.status,
  };
}
