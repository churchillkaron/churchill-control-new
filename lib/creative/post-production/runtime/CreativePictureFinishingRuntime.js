import {
  CreativeMediaRuntime,
} from "@/lib/creative/media/runtime/CreativeMediaRuntime";

import {
  CreativeStorageRuntime,
} from "@/lib/creative/storage/runtime/CreativeStorageRuntime";

import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";

import {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";

function renderKey(aspectRatio) {
  return `picture_finish_${String(aspectRatio).replace(":", "_")}_v1`;
}

function existingVariant(assets, aspectRatio) {
  const key = renderKey(aspectRatio);

  return (assets || []).find((asset) => (
    asset.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER &&
    asset.metadata?.render_key === key &&
    asset.url
  )) || null;
}

async function createVariant({
  organization_id,
  creative_project_id,
  package_document,
  assembly,
  export_spec,
}) {
  const rendered = await CreativeMediaRuntime.finishPicture({
    source_url: assembly.public_url,
    overlays: package_document.graphics?.overlays || [],
    aspect_ratio: export_spec.aspect_ratio,
    typography: package_document.graphics?.typography || {},
    color: package_document.finishing?.color || {},
    fps: 30,
  });
  const suffix = export_spec.aspect_ratio.replace(":", "x");
  const storage = await CreativeStorageRuntime.uploadBuffer({
    organization_id,
    creative_project_id,
    asset_id: `picture-finish-${suffix}`,
    filename: rendered.filename,
    buffer: rendered.buffer,
    content_type: rendered.content_type,
  });
  const edit = package_document.editorial?.edit_decision_list || [];
  const asset = await CreativeAssetGraphRuntime.create({
    organization_id,
    creative_project_id,
    type: CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
    status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
    name: `Picture-Finished ${export_spec.purpose} ${export_spec.aspect_ratio}`,
    description:
      "Industry-neutral picture finish using only project typography, overlays, color direction and channel framing.",
    url: storage.public_url,
    storage_path: storage.storage_path,
    lineage: {
      source: "creative_picture_finishing",
      provider_id: "avantiqo-media-runtime",
      capability: "creative.video.finish_picture",
      generation_version: 1,
    },
    technical: {
      mime_type: rendered.content_type,
      width: rendered.width,
      height: rendered.height,
      duration_seconds:
        package_document.editorial?.total_duration_seconds || null,
    },
    intelligence: {
      quality_score: 0,
      brand_match_score: 0,
      reuse_score: 0,
      safety_status: "SHOT_QA_PASSED",
      tags: [
        "picture-finish",
        export_spec.aspect_ratio,
        export_spec.purpose,
      ],
    },
    reuse: {
      reusable: false,
      approved_for_reuse: false,
    },
    review: {
      ai_reviewed: true,
      human_reviewed: false,
      approved: false,
      notes:
        "Picture finishing complete. Sound mix and final-film QA remain mandatory.",
    },
    metadata: {
      render_key: renderKey(export_spec.aspect_ratio),
      render_stage: "PICTURE_FINISH",
      source_assembly_asset_id: assembly.asset?.id || null,
      source_task_ids: edit.map((item) => item.source_task_id),
      shot_ids: edit.map((item) => item.shot_id),
      aspect_ratio: export_spec.aspect_ratio,
      purpose: export_spec.purpose,
      overlays_applied: rendered.overlays_applied,
      graphics_pending: false,
      audio_mix_pending: true,
      color_finish_pending: false,
      final_film_qa_pending: true,
      industry_neutral: true,
    },
  });

  return {
    reused: false,
    aspect_ratio: export_spec.aspect_ratio,
    public_url: storage.public_url,
    storage_path: storage.storage_path,
    asset,
  };
}

export const CreativePictureFinishingRuntime = {
  async finish({
    organization_id,
    creative_project_id,
    package_document,
    assembly,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    if (!assembly?.public_url) throw new Error("picture assembly required");

    const assets = await CreativeAssetGraphRuntime.list({
      organization_id,
      creative_project_id,
    });
    const variants = [];

    for (const exportSpec of package_document?.exports || []) {
      const existing = existingVariant(
        assets,
        exportSpec.aspect_ratio,
      );

      if (existing) {
        variants.push({
          reused: true,
          aspect_ratio: exportSpec.aspect_ratio,
          public_url: existing.url,
          storage_path: existing.storage_path,
          asset: existing,
        });
        continue;
      }

      variants.push(
        await createVariant({
          organization_id,
          creative_project_id,
          package_document,
          assembly,
          export_spec: exportSpec,
        }),
      );
    }

    return {
      stage: "PICTURE_FINISH",
      variants,
      graphics_pending: false,
      audio_mix_pending: true,
      color_finish_pending: false,
      final_film_qa_pending: true,
      industry_neutral: true,
    };
  },
};
