import crypto from "node:crypto";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

const REPAIR_MAP = {
  file_non_empty: {
    action: "RERUN_RENDER_RUNTIME",
    scope: "RENDER",
    reason: "Output file was empty or unavailable.",
  },
  video_stream_present: {
    action: "RERUN_VIDEO_ASSEMBLY",
    scope: "VIDEO_GRAPH",
    reason: "Rendered output has no valid video stream.",
  },
  duration_present: {
    action: "REBUILD_TIMELINE_OR_RENDER",
    scope: "TIMELINE",
    reason: "Rendered duration could not be verified.",
  },
  duration_within_tolerance: {
    action: "RECONCILE_EDL_DURATION",
    scope: "TIMELINE",
    reason: "Rendered duration differs from the approved EDL.",
  },
  dimensions_match_profile: {
    action: "RERENDER_EXPORT_PROFILE",
    scope: "EXPORT_PROFILE",
    reason: "Rendered dimensions do not match the selected delivery profile.",
  },
  video_codec_matches_profile: {
    action: "RERENDER_EXPORT_PROFILE",
    scope: "EXPORT_PROFILE",
    reason: "Rendered video codec does not match the selected delivery profile.",
  },
  audio_stream_present: {
    action: "REBUILD_AUDIO_GRAPH",
    scope: "AUDIO_GRAPH",
    reason: "Expected audio is missing from the rendered output.",
  },
  audio_codec_matches_profile: {
    action: "RERENDER_AUDIO_PROFILE",
    scope: "AUDIO_GRAPH",
    reason: "Rendered audio codec does not match the selected delivery profile.",
  },
};

function identity(render, failedChecks) {
  return crypto.createHash("sha256").update(JSON.stringify({
    render_id: render.id,
    render_identity: render.metadata?.render_identity || null,
    failed_checks: failedChecks,
  })).digest("hex");
}

export const CreativeRenderRepairRuntime = {
  async plan({
    organization_id,
    render_asset_node_id,
    force = false,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!render_asset_node_id) throw new Error("render_asset_node_id required");

    const render = await AssetGraphRepository.getById(render_asset_node_id);
    if (
      !render ||
      render.organization_id !== organization_id ||
      render.type !== CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER
    ) {
      throw new Error("Final render asset not found");
    }

    const failedChecks = Array.isArray(
      render.metadata?.technical_qc?.failed_checks,
    )
      ? render.metadata.technical_qc.failed_checks
      : [];

    if (!failedChecks.length) {
      throw new Error("RENDER_HAS_NO_TECHNICAL_QC_FAILURES");
    }

    const repairIdentity = identity(render, failedChecks);
    const projectNodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: render.creative_project_id,
    });
    const existing = !force
      ? projectNodes.find((node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.REPAIR_PLAN &&
          node.metadata?.repair_identity === repairIdentity,
        )
      : null;

    if (existing) return { plan: existing, reused: true };

    const actions = failedChecks.map((checkId, index) => ({
      order: index + 1,
      check_id: checkId,
      ...(REPAIR_MAP[checkId] || {
        action: "MANUAL_TECHNICAL_REVIEW",
        scope: "UNKNOWN",
        reason: "No deterministic repair adapter exists for this check.",
      }),
      automatic: Boolean(REPAIR_MAP[checkId]),
    }));
    const automatic = actions.every((action) => action.automatic);

    const node = createCreativeAssetNode({
      organization_id,
      creative_project_id: render.creative_project_id,
      parent_asset_node_id: render.id,
      type: CREATIVE_ASSET_NODE_TYPES.REPAIR_PLAN,
      status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: `${render.name || "Render"} repair plan`,
      description: "Technical QC repair plan generated from verified failures.",
      lineage: {
        source: "render_technical_qc",
        capability: "creative.render.repair.plan",
        generation_version: 1,
      },
      intelligence: {
        safety_status: "UNKNOWN",
        tags: ["render-repair"],
      },
      reuse: {
        reusable: false,
        approved_for_reuse: false,
      },
      review: {
        ai_reviewed: true,
        human_reviewed: false,
        approved: false,
      },
      metadata: {
        repair_identity: repairIdentity,
        failed_render_asset_node_id: render.id,
        timeline_asset_node_id: render.metadata?.timeline_asset_node_id || null,
        failed_checks: failedChecks,
        actions,
        fully_automatic: automatic,
        export_profile: render.metadata?.export_profile || null,
        tracks: render.metadata?.tracks || {},
        created_at: new Date().toISOString(),
      },
    });

    return {
      plan: await AssetGraphRepository.create(node),
      reused: false,
    };
  },
};
