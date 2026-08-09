import {
  CreativeMasterSoundtrackIntegrityRuntime,
} from "@/lib/creative/audio/runtime/CreativeMasterSoundtrackIntegrityRuntime";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export const CreativeProfessionalFinalAudioIntegrityRuntime = Object.freeze({
  contract: "CREATIVE_PROFESSIONAL_FINAL_AUDIO_INTEGRITY_V1",

  async validate({
    organization_id,
    final_render,
    master_render,
    policy = {},
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!final_render?.id || !final_render?.url) {
      throw new Error("FINAL_PROFESSIONAL_RENDER_REQUIRED");
    }
    if (!master_render?.id) {
      throw new Error("MASTER_SOUNDTRACK_RENDER_REQUIRED");
    }

    const sourceId =
      master_render.metadata?.master_soundtrack_asset_node_id || null;
    if (!sourceId) {
      throw new Error("MASTER_SOUNDTRACK_SOURCE_ASSET_NODE_ID_REQUIRED");
    }
    const source = await AssetGraphRepository.getById(sourceId);
    if (!source || String(source.organization_id) !== String(organization_id)) {
      throw new Error("MASTER_SOUNDTRACK_SOURCE_ASSET_NOT_FOUND");
    }

    const integrity = await CreativeMasterSoundtrackIntegrityRuntime.validate({
      organization_id,
      source_asset_node: source,
      render_asset_node: final_render,
      expected_duration_seconds:
        master_render.metadata?.master_soundtrack_integrity?.expected_duration_seconds ||
        source.technical?.duration_seconds ||
        final_render.technical?.duration_seconds,
      policy,
    });

    const current = await AssetGraphRepository.getById(final_render.id);
    const updated = await AssetGraphRepository.update(final_render.id, {
      status: integrity.passed ? current.status : "REJECTED",
      review: {
        ...object(current.review),
        ai_reviewed: true,
        approved: false,
        notes: integrity.passed
          ? "Professional finishing and final master-soundtrack integrity passed."
          : `Final master soundtrack integrity failed: ${integrity.failed_checks.join(", ")}`,
      },
      metadata: {
        ...object(current.metadata),
        professional_final_audio_integrity_contract:
          "CREATIVE_PROFESSIONAL_FINAL_AUDIO_INTEGRITY_V1",
        master_soundtrack_integrity_after_finishing: integrity,
        master_soundtrack_integrity_passed_after_finishing: integrity.passed,
        final_master_audio_verified: integrity.passed,
      },
    });

    if (!integrity.passed) {
      throw new Error(
        `FINAL_MASTER_SOUNDTRACK_INTEGRITY_FAILED:${integrity.failed_checks.join(",")}`,
      );
    }

    return {
      render: updated,
      integrity,
    };
  },
});
