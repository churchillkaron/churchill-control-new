import {
  CreativeMediaInspectionRuntime,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

function assetUrl(asset = {}) {
  return (
    asset.file_url ||
    asset.fileUrl ||
    asset.video_url ||
    asset.videoUrl ||
    asset.audio_url ||
    asset.audioUrl ||
    asset.image_url ||
    asset.imageUrl ||
    asset.url ||
    asset.uri ||
    null
  );
}

export const CreativeAssetIntelligenceRuntime = {
  async analyze(asset = {}, options = {}) {
    const url = assetUrl(asset);
    const file = options.file || asset.file || null;

    if (!url && !file) {
      throw new Error("Creative asset media required");
    }

    const inspection = await CreativeMediaInspectionRuntime.inspect({
      file,
      url,
      file_name:
        asset.file_name ||
        asset.fileName ||
        asset.name ||
        null,
      mime_type:
        asset.mime_type ||
        asset.mimeType ||
        asset.metadata?.technical?.mime_type ||
        null,
      policy:
        options.policy ||
        asset.inspection_policy ||
        asset.metadata?.inspection_policy ||
        {},
    });

    return {
      ...inspection.technical,
      status: inspection.status,
      reason: inspection.reason,
      labels:
        asset.analysis?.tags ||
        asset.metadata?.labels ||
        [],
      people:
        asset.analysis?.people ||
        asset.metadata?.people ||
        [],
      objects:
        asset.analysis?.objects ||
        asset.metadata?.objects ||
        [],
      text:
        asset.analysis?.visible_text ||
        asset.metadata?.text ||
        null,
      embedding:
        asset.metadata?.embedding ||
        null,
      quality_score:
        asset.analysis?.quality_score ??
        asset.metadata?.quality_score ??
        null,
      reuse_score:
        asset.analysis?.reuse_score ??
        asset.metadata?.reuse_score ??
        null,
      brand_score:
        asset.analysis?.brand_alignment_score ??
        asset.metadata?.brand_score ??
        null,
      analyzed_at: new Date().toISOString(),
    };
  },
};
