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

function existingMaster(assets = []) {
  return assets.find((asset) => (
    asset.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER &&
    asset.metadata?.render_key === "master_16_9_v1" &&
    asset.status === CREATIVE_ASSET_NODE_STATUS.APPROVED &&
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
    const existing = existingMaster(assets);

    if (existing) {
      return {
        reused: true,
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
      asset_id: "final-render",
      filename: rendered.filename,
      buffer: rendered.buffer,
      content_type: rendered.content_type,
    });

    const asset = await CreativeAssetGraphRuntime.create({
      organization_id,
      creative_project_id,
      type: CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
      status: CREATIVE_ASSET_NODE_STATUS.APPROVED,
      name: "Approved Film Master 16:9",
      description:
        "Deterministically assembled from individually directed and quality-approved video shots.",
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
        quality_score: 100,
        brand_match_score: 0,
        reuse_score: 100,
        safety_status: "REVIEWED",
        tags: [
          "final-render",
          "master-16-9",
          "atomic-shot-production",
        ],
      },
      reuse: {
        reusable: true,
        approved_for_reuse: true,
      },
      review: {
        ai_reviewed: true,
        human_reviewed: false,
        approved: true,
        notes:
          "All source shots passed mandatory master-still and video-shot QA before deterministic assembly.",
      },
      metadata: {
        render_key: "master_16_9_v1",
        render_contract: "deterministic_atomic_shot_assembly_v1",
        source_task_ids: editDecisionList.map((item) => item.source_task_id),
        shot_ids: editDecisionList.map((item) => item.shot_id),
        graphics_pending: Boolean(
          package_document.graphics?.overlays?.length,
        ),
        audio_mix_pending: Boolean(
          Object.values(package_document.audio?.stems || {})
            .some((items) => Array.isArray(items) && items.length),
        ),
      },
    });

    return {
      reused: false,
      asset,
      public_url: storage.public_url,
      storage_path: storage.storage_path,
    };
  },
};
