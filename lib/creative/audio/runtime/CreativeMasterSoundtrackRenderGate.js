import {
  CreativeEdlRenderRuntime,
} from "@/lib/creative/post-production/runtime/CreativeEdlRenderRuntime";
import {
  CreativeMasterSoundtrackRuntime,
} from "@/lib/creative/audio/runtime/CreativeMasterSoundtrackRuntime";
import {
  CreativeMasterSoundtrackIntegrityRuntime,
} from "@/lib/creative/audio/runtime/CreativeMasterSoundtrackIntegrityRuntime";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";

const FLAG = Symbol.for("avantiqo.creative.master-soundtrack-render-gate.v1");

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function install() {
  if (CreativeEdlRenderRuntime[FLAG]) return;
  const renderWithoutGate = CreativeEdlRenderRuntime.render.bind(
    CreativeEdlRenderRuntime,
  );
  Object.defineProperty(CreativeEdlRenderRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeEdlRenderRuntime.render = async function renderWithMasterSoundtrackGate(input = {}) {
    const organizationId = input.organization_id;
    const timelineId = input.timeline_asset_node_id;
    if (!organizationId) throw new Error("organization_id required");
    if (!timelineId) throw new Error("timeline_asset_node_id required");

    const timeline = await AssetGraphRepository.getById(timelineId);
    if (!timeline || String(timeline.organization_id) !== String(organizationId)) {
      throw new Error("MASTER_SOUNDTRACK_TIMELINE_NOT_FOUND");
    }
    const project = await CreativeProjectRepository.getById(
      timeline.creative_project_id,
    );
    if (!project || String(project.organization_id) !== String(organizationId)) {
      throw new Error("MASTER_SOUNDTRACK_PROJECT_NOT_FOUND");
    }
    const nodes = await AssetGraphRepository.listByProject({
      organization_id: organizationId,
      creative_project_id: timeline.creative_project_id,
    });
    const master = await CreativeMasterSoundtrackRuntime.resolve({
      organization_id: organizationId,
      creative_project_id: timeline.creative_project_id,
      timeline,
      project,
      nodes,
    });
    const track = CreativeMasterSoundtrackRuntime.track(master);
    const suppliedTracks = object(input.tracks);
    const tracks = {
      ...suppliedTracks,
      audio: [track],
      asset_node_ids: [
        master.asset_node_id,
        ...(Array.isArray(suppliedTracks.overlays)
          ? suppliedTracks.overlays.map((item) => item.asset_node_id || item.assetNodeId)
          : []),
        suppliedTracks.subtitle_asset_node_id || suppliedTracks.subtitleAssetNodeId || null,
      ].filter(Boolean),
      master_soundtrack: {
        contract: master.contract,
        contract_hash: master.contract_hash,
        asset_node_id: master.asset_node_id,
        duration_seconds: master.duration_seconds,
        source_in_seconds: 0,
        timeline_in_seconds: 0,
        gain: 1,
      },
    };
    const exportProfile = {
      ...object(input.export_profile),
      include_source_audio: false,
      includeSourceAudio: false,
      audio_mix_normalize: false,
      audioMixNormalize: false,
      audio_required: true,
      primary_audio_asset_id: master.asset_node_id,
      primaryAudioAssetId: master.asset_node_id,
      master_soundtrack_contract_hash: master.contract_hash,
    };

    const result = await renderWithoutGate({
      ...input,
      export_profile: exportProfile,
      tracks,
      policy: {
        ...object(input.policy),
        master_soundtrack_required: true,
        master_soundtrack_contract_hash: master.contract_hash,
        prohibit_source_clip_audio: true,
        prohibit_provider_added_music: true,
      },
    });
    if (!result?.render?.id) {
      throw new Error("MASTER_SOUNDTRACK_RENDER_RESULT_REQUIRED");
    }

    const integrity = await CreativeMasterSoundtrackIntegrityRuntime.validate({
      organization_id: organizationId,
      source_asset_node: master.asset_node,
      render_asset_node: result.render,
      expected_duration_seconds: master.duration_seconds,
      policy: input.policy || {},
    });
    const current = await AssetGraphRepository.getById(result.render.id);
    const updated = await AssetGraphRepository.update(result.render.id, {
      status: integrity.passed ? current.status : "REJECTED",
      review: {
        ...object(current.review),
        ai_reviewed: true,
        approved: false,
        notes: integrity.passed
          ? "Technical QC and immutable master-soundtrack integrity passed."
          : `Master soundtrack integrity failed: ${integrity.failed_checks.join(", ")}`,
      },
      metadata: {
        ...object(current.metadata),
        master_soundtrack_contract: master.contract,
        master_soundtrack_contract_hash: master.contract_hash,
        master_soundtrack_asset_node_id: master.asset_node_id,
        master_soundtrack_source_checksum: master.asset_checksum,
        master_soundtrack_integrity: integrity,
        master_soundtrack_integrity_passed: integrity.passed,
        source_clip_audio_included: false,
        provider_added_music_allowed: false,
        additional_music_tracks_allowed: false,
      },
    });

    if (!integrity.passed) {
      throw new Error(
        `MASTER_SOUNDTRACK_INTEGRITY_FAILED:${integrity.failed_checks.join(",")}`,
      );
    }
    if (
      text(updated.metadata?.master_soundtrack_contract_hash) !==
      text(master.contract_hash)
    ) {
      throw new Error("MASTER_SOUNDTRACK_RENDER_CONTRACT_PERSISTENCE_FAILED");
    }

    return {
      ...result,
      render: updated,
      master_soundtrack: master,
      master_soundtrack_integrity: integrity,
    };
  };
}

install();

export const CreativeMasterSoundtrackRenderGate = {
  installed: true,
};
