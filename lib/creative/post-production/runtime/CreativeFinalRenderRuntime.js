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

function existingAssembly(assets = []) {
  return assets.find((asset) => (
    asset.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER &&
    asset.metadata?.render_key === "picture_assembly_16_9_v1" &&
    [
      CREATIVE_ASSET_NODE_STATUS.REVIEW,
      CREATIVE_ASSET_NODE_STATUS.APPROVED,
    ].includes(asset.status) &&
    asset.url
  ));
}

export const CreativeFinalRenderRuntime = {
  async render({
    organization_id,
    creative_project_id,
    package_document,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    if (package_document?.status !== "READY_FOR_ASSEMBLY") {
      throw new Error("POST_PRODUCTION_PACKAGE_BLOCKED");
    }

    const assets = await CreativeAssetGraphRuntime.list({
      organization_id,
      creative_project_id,
    });
    const existing = existingAssembly(assets);

    if (existing) {
      return {
        reused: true,
        stage: "PICTURE_ASSEMBLY",
        asset: existing,
        public_url: existing.url,
        storage_path: existing.storage_path,
      };
    }

    const editDecisionList =
      package_document.editorial?.edit_decision_list || [];
    const rendered = await CreativeMediaRuntime.composeMaster({
      edit_decision_list: editDecisionList,
      width: 1920,
      height: 1080,
      fps: 30,
    });

    const storage = await CreativeStorageRuntime.uploadBuffer({
      organization_id,
      creative_project_id,
      asset_id: "picture-assembly",
      filename: rendered.filename,
      buffer: rendered.buffer,
      content_type: rendered.content_type,
    });

    const graphicsPending = Boolean(
      package_document.graphics?.overlays?.length,
    );
    const audioMixPending = Boolean(
      Object.values(package_document.audio?.stems || {})
        .some((items) => Array.isArray(items) && items.length),
    );

    const asset = await CreativeAssetGraphRuntime.create({
      organization_id,
      creative_project_id,
      type: CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
      status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: "Picture Assembly Master 16:9",
      description:
        "Deterministic picture assembly from individually directed and quality-approved video shots. Graphics and sound finishing remain explicit downstream stages.",
      url: storage.public_url,
      storage_path: storage.storage_path,
      lineage: {
        source: "creative_post_production",
        provider_id: "avantiqo-media-runtime",
        capability: "creative.video.compose",
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
          "picture-assembly",
          "master-16-9",
          "atomic-shot-production",
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
          "All source shots passed mandatory master-still and video-shot QA. Picture assembly still requires graphics, sound mix, color finishing and final-film QC.",
      },
      metadata: {
        render_key: "picture_assembly_16_9_v1",
        render_stage: "PICTURE_ASSEMBLY",
        render_contract: "deterministic_atomic_shot_assembly_v1",
        source_task_ids: editDecisionList.map((item) => item.source_task_id),
        shot_ids: editDecisionList.map((item) => item.shot_id),
        graphics_pending: graphicsPending,
        audio_mix_pending: audioMixPending,
        color_finish_pending: true,
        final_film_qa_pending: true,
      },
    });

    return {
      reused: false,
      stage: "PICTURE_ASSEMBLY",
      asset,
      public_url: storage.public_url,
      storage_path: storage.storage_path,
      graphics_pending: graphicsPending,
      audio_mix_pending: audioMixPending,
      color_finish_pending: true,
      final_film_qa_pending: true,
    };
  },
};
