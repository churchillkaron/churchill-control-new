import {
  CreativeMediaRuntime,
} from "@/lib/creative/media/runtime/CreativeMediaRuntime";

import {
  CreativeChannelReframingRuntime,
} from "@/lib/creative/post-production/runtime/CreativeChannelReframingRuntime";

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
  return `picture_finish_${String(aspectRatio).replace(":", "_")}_v2`;
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
  const edit = package_document.editorial?.edit_decision_list || [];
  const reframed = await CreativeChannelReframingRuntime.render({
    organization_id,
    creative_project_id,
    edit_decision_list: edit,
    export_spec,
    fps: 30,
  });
  const suffix = export_spec.aspect_ratio.replace(":", "x");
  const reframedStorage = await CreativeStorageRuntime.uploadBuffer({
    organization_id,
    creative_project_id,
    asset_id: `channel-reframe-${suffix}`,
    filename: reframed.filename,
    buffer: reframed.buffer,
    content_type: reframed.content_type,
  });
  const rendered = await CreativeMediaRuntime.finishPicture({
    source_url: reframedStorage.public_url,
    overlays: package_document.graphics?.overlays || [],
    aspect_ratio: export_spec.aspect_ratio,
    typography: package_document.graphics?.typography || {},
    color: package_document.finishing?.color || {},
    fps: 30,
  });
  const storage = await CreativeStorageRuntime.uploadBuffer({
    organization_id,
    creative_project_id,
    asset_id: `picture-finish-${suffix}`,
    filename: rendered.filename,
    buffer: rendered.buffer,
    content_type: rendered.content_type,
  });
  const asset = await CreativeAssetGraphRuntime.create({
    organization_id,
    creative_project_id,
    type: CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
    status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
    name: `Picture-Finished ${export_spec.purpose} ${export_spec.aspect_ratio}`,
    description:
      "Industry-neutral picture finish rebuilt shot-by-shot for the target channel using subject-aware framing, project typography, overlays and color direction.",
    url: storage.public_url,
    storage_path: storage.storage_path,
    lineage: {
      source: "creative_picture_finishing",
      provider_id: "avantiqo-media-runtime",
      capability: "creative.video.subject_aware_finish_picture",
      generation_version: 2,
    },
    technical: {
      mime_type: rendered.content_type,
      width: rendered.width,
      height: rendered.height,
      duration_seconds:
        rendered.duration_seconds ||
        reframed.duration_seconds ||
        package_document.editorial?.total_duration_seconds ||
        null,
    },
    intelligence: {
      quality_score: 0,
      brand_match_score: 0,
      reuse_score: 0,
      safety_status: "SHOT_QA_PASSED",
      tags: [
        "picture-finish",
        "subject-aware-reframe",
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
        "Subject-aware picture finishing complete. Sound mix and final-film QA remain mandatory.",
    },
    metadata: {
      render_key: renderKey(export_spec.aspect_ratio),
      render_stage: "PICTURE_FINISH",
      render_contract: "subject_aware_channel_reframe_v1",
      source_assembly_asset_id: assembly.asset?.id || null,
      source_reframe_storage_path: reframedStorage.storage_path,
      source_task_ids: edit.map((item) => item.source_task_id),
      shot_ids: edit.map((item) => item.shot_id),
      aspect_ratio: export_spec.aspect_ratio,
      purpose: export_spec.purpose,
      overlays_applied: rendered.overlays_applied,
      reframing_focus_plan: reframed.focus_plan,
      transitions_applied: reframed.transitions_applied,
      transition_count: reframed.transition_count,
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
    focus_plan: reframed.focus_plan,
    transitions_applied: reframed.transitions_applied,
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
          focus_plan: existing.metadata?.reframing_focus_plan || [],
          transitions_applied: existing.metadata?.transitions_applied || [],
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
      reframing_contract: "subject_aware_channel_reframe_v1",
      industry_neutral: true,
    };
  },
};
