import crypto from "node:crypto";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

const CONTRACT = "AVANTIQO_FINAL_MASTERING_V1";
const QC_CONTRACT = "AVANTIQO_FINAL_MASTERING_QC_V1";
const SEAL_CONTRACT = "AVANTIQO_FINAL_MASTERING_SEAL_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !["created_at", "updated_at", "evaluated_at", "certified_at"].includes(key))
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function firstVideoStream(node = {}) {
  return list(node.technical?.streams).find((stream) => stream.codec_type === "video") || {};
}

function firstAudioStream(node = {}) {
  return list(node.technical?.streams).find((stream) => stream.codec_type === "audio") || {};
}

function technicalSnapshot(master = {}) {
  const video = firstVideoStream(master);
  const audio = firstAudioStream(master);
  return {
    checksum: master.technical?.checksum || null,
    mime_type: master.technical?.mime_type || null,
    container: master.technical?.container || null,
    width: finite(master.technical?.width ?? video.width),
    height: finite(master.technical?.height ?? video.height),
    duration_seconds: finite(master.technical?.duration_seconds),
    frame_rate:
      finite(master.technical?.frame_rate) ??
      finite(master.technical?.fps) ??
      finite(video.frame_rate),
    video_codec: master.technical?.video_codec || video.codec_name || null,
    video_profile: master.technical?.video_profile || video.profile || null,
    pixel_format: master.technical?.pixel_format || video.pixel_format || video.pix_fmt || null,
    color_space:
      master.technical?.color_space ||
      master.technical?.colorspace ||
      video.color_space ||
      null,
    color_transfer:
      master.technical?.color_transfer ||
      video.color_transfer ||
      null,
    color_primaries:
      master.technical?.color_primaries ||
      video.color_primaries ||
      null,
    color_range:
      master.technical?.color_range ||
      video.color_range ||
      null,
    audio_codec: master.technical?.audio_codec || audio.codec_name || null,
    audio_sample_rate: finite(master.technical?.sample_rate ?? audio.sample_rate),
    audio_channels: finite(master.technical?.channels ?? audio.channels),
    audio_channel_layout: master.technical?.channel_layout || audio.channel_layout || null,
    file_size_bytes: finite(master.technical?.file_size_bytes),
  };
}

function exactPictureState(master = {}) {
  return {
    color_finishing_contract: master.metadata?.color_finishing_contract || null,
    color_finishing_identity: master.metadata?.color_finishing_identity || null,
    color_finishing_qc_contract: master.metadata?.color_finishing_qc_contract || null,
    color_finishing_qc_seal_contract:
      master.metadata?.color_finishing_qc_seal_contract || null,
    color_finishing_qc_seal_hash:
      master.metadata?.color_finishing_qc_seal_hash || null,
    color_finishing_qc_sealed:
      master.metadata?.color_finishing_qc_sealed === true,
    motion_graphics_qc_seal_hash:
      master.metadata?.motion_graphics_qc_seal_hash || null,
  };
}

function exactAudioState(master = {}) {
  return {
    master_soundtrack_contract:
      master.metadata?.master_soundtrack_contract || null,
    master_soundtrack_contract_hash:
      master.metadata?.master_soundtrack_contract_hash || null,
    master_soundtrack_asset_node_id:
      master.metadata?.master_soundtrack_asset_node_id || null,
    master_soundtrack_integrity_passed_after_finishing:
      master.metadata?.master_soundtrack_integrity_passed_after_finishing === true,
    master_soundtrack_integrity_passed_after_color_finishing:
      master.metadata?.master_soundtrack_integrity_passed_after_color_finishing === true,
    final_master_audio_verified:
      master.metadata?.final_master_audio_verified === true,
  };
}

function sourceLimited(snapshot = {}) {
  const pixel = text(snapshot.pixel_format).toLowerCase();
  const codec = text(snapshot.video_codec).toLowerCase();
  return {
    chroma_precision_limited:
      pixel.includes("420") || pixel.includes("nv12") || pixel.includes("p010") === false && pixel.includes("422") === false && pixel.includes("444") === false,
    distribution_codec_source:
      ["h264", "hevc", "av1", "vp9"].includes(codec),
    source_pixel_format: snapshot.pixel_format || null,
    source_video_codec: snapshot.video_codec || null,
    policy:
      "Final mastering preserves the authoritative rendered pixels. It does not transcode low-chroma or distribution-compressed source media into a misleading premium mezzanine and claim recovered precision.",
  };
}

function latest(nodes, predicate) {
  return [...nodes]
    .filter(predicate)
    .sort((left, right) =>
      Date.parse(right.updated_at || right.created_at || 0) -
      Date.parse(left.updated_at || left.created_at || 0),
    )[0] || null;
}

function qcFor(master, snapshot, picture, audio) {
  const soundtrackRequired = Boolean(
    audio.master_soundtrack_contract_hash ||
    audio.master_soundtrack_asset_node_id,
  );
  const colorRequired = Boolean(picture.color_finishing_contract);
  const checks = [
    {
      id: "master_file_present",
      passed: Boolean(master.id && master.url),
      evidence: master.url || null,
    },
    {
      id: "master_checksum_present",
      passed: Boolean(snapshot.checksum),
      evidence: snapshot.checksum,
    },
    {
      id: "master_not_rejected",
      passed: master.status !== CREATIVE_ASSET_NODE_STATUS.REJECTED,
      evidence: master.status,
    },
    {
      id: "technical_qc_passed",
      passed: master.metadata?.technical_qc?.passed === true,
      evidence: master.metadata?.technical_qc || null,
    },
    {
      id: "picture_dimensions_present",
      passed: Boolean(snapshot.width && snapshot.height),
      evidence: { width: snapshot.width, height: snapshot.height },
    },
    {
      id: "frame_rate_present",
      passed: Boolean(snapshot.frame_rate),
      evidence: snapshot.frame_rate,
    },
    {
      id: "video_codec_present",
      passed: Boolean(snapshot.video_codec),
      evidence: snapshot.video_codec,
    },
    {
      id: "pixel_format_present",
      passed: Boolean(snapshot.pixel_format),
      evidence: snapshot.pixel_format,
    },
    {
      id: "color_metadata_present",
      passed: Boolean(
        snapshot.color_space &&
        snapshot.color_transfer &&
        snapshot.color_primaries &&
        snapshot.color_range,
      ),
      evidence: {
        color_space: snapshot.color_space,
        color_transfer: snapshot.color_transfer,
        color_primaries: snapshot.color_primaries,
        color_range: snapshot.color_range,
      },
    },
    {
      id: "color_finishing_sealed_when_applicable",
      passed: !colorRequired || picture.color_finishing_qc_sealed === true,
      evidence: picture,
    },
    {
      id: "final_master_audio_verified_when_applicable",
      passed: !soundtrackRequired || audio.final_master_audio_verified === true,
      evidence: audio,
    },
  ];
  const failed = checks.filter((check) => !check.passed);
  const base = {
    contract: QC_CONTRACT,
    actual_rendered_file_is_authority: true,
    no_quality_inventing_transcode_allowed: true,
    color_and_audio_seals_must_survive_final_mastering: true,
    checks,
    failed_checks: failed.map((check) => check.id),
    passed: failed.length === 0,
  };
  return { ...base, qc_hash: digest(base) };
}

export const CreativeFinalMasteringRuntime = Object.freeze({
  contract: CONTRACT,
  qc_contract: QC_CONTRACT,
  seal_contract: SEAL_CONTRACT,
  provider_calls_executed: 0,
  deterministic_certification_only: true,

  async certify({
    organization_id,
    creative_project_id,
    master_render,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    if (!master_render?.id) throw new Error("FINAL_MASTER_RENDER_REQUIRED");
    if (text(master_render.organization_id) !== text(organization_id)) {
      throw new Error("FINAL_MASTER_ORGANIZATION_MISMATCH");
    }
    if (text(master_render.creative_project_id) !== text(creative_project_id)) {
      throw new Error("FINAL_MASTER_PROJECT_MISMATCH");
    }
    if (master_render.type !== CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER) {
      throw new Error("FINAL_MASTER_RENDER_TYPE_REQUIRED");
    }

    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id,
    });
    const current = nodes.find((node) => node.id === master_render.id) || master_render;
    const snapshot = technicalSnapshot(current);
    const picture = exactPictureState(current);
    const audio = exactAudioState(current);
    const limits = sourceLimited(snapshot);
    const qc = qcFor(current, snapshot, picture, audio);
    const sealPayload = {
      contract: SEAL_CONTRACT,
      master_asset_node_id: current.id,
      master_checksum: snapshot.checksum,
      technical_snapshot: snapshot,
      picture_state: picture,
      audio_state: audio,
      source_limitations: limits,
      qc_hash: qc.qc_hash,
    };
    const seal = {
      ...sealPayload,
      seal_hash: digest(sealPayload),
    };
    const identity = digest({
      contract: CONTRACT,
      master_asset_node_id: current.id,
      master_checksum: snapshot.checksum,
      seal_hash: seal.seal_hash,
    });

    const existing = latest(nodes, (node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
      node.parent_asset_node_id === current.id &&
      node.lineage?.source === "final_mastering_certification" &&
      node.metadata?.final_mastering_identity === identity,
    );
    if (existing) {
      return {
        contract: CONTRACT,
        passed: existing.metadata?.passed === true,
        report: existing,
        seal: existing.metadata?.final_mastering_seal || null,
        reused: true,
      };
    }

    const report = createCreativeAssetNode({
      organization_id,
      creative_project_id,
      parent_asset_node_id: current.id,
      type: CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT,
      status: qc.passed
        ? CREATIVE_ASSET_NODE_STATUS.REVIEW
        : CREATIVE_ASSET_NODE_STATUS.REJECTED,
      name: `${current.name || "Creative master"} final mastering certification`,
      description:
        "Immutable final-master evidence binding the exact rendered file checksum, picture/color state, audio state, technical characteristics and source limitations before any distribution derivatives are made.",
      lineage: {
        source: "final_mastering_certification",
        capability: "creative.mastering.final.certify",
        generation_version: 1,
      },
      intelligence: {
        quality_score: qc.passed ? 100 : 0,
        safety_status: qc.passed ? "REVIEW_REQUIRED" : "REJECTED",
        tags: [
          "final-mastering",
          "immutable-master",
          "checksum-seal",
          "source-limited-truth",
          "pre-delivery",
        ],
      },
      reuse: { reusable: false, approved_for_reuse: false },
      review: {
        ai_reviewed: true,
        human_reviewed: false,
        approved: false,
        notes: qc.passed
          ? "Final master is machine-certified for derivative generation. Publication still requires the existing authenticated release approvals."
          : `Final mastering blocked: ${qc.failed_checks.join(", ")}`,
      },
      metadata: {
        contract: CONTRACT,
        final_mastering_identity: identity,
        final_mastering_qc_contract: QC_CONTRACT,
        final_mastering_qc: qc,
        final_mastering_seal_contract: SEAL_CONTRACT,
        final_mastering_seal: qc.passed ? seal : null,
        final_mastering_seal_hash: qc.passed ? seal.seal_hash : null,
        master_render_asset_node_id: current.id,
        master_checksum: snapshot.checksum,
        technical_snapshot: snapshot,
        picture_state: picture,
        audio_state: audio,
        source_limitations: limits,
        passed: qc.passed,
        immutable_source_master: true,
        derivative_generation_authorized: qc.passed,
        publication_authorized: false,
        provider_calls_executed: 0,
        certified_at: new Date().toISOString(),
      },
    });
    const persisted = await AssetGraphRepository.create(report);
    if (!qc.passed) {
      throw new Error(`FINAL_MASTERING_QC_FAILED:${qc.failed_checks.join(",")}`);
    }

    return {
      contract: CONTRACT,
      passed: true,
      report: persisted,
      seal,
      reused: false,
    };
  },
});

export const AVANTIQO_FINAL_MASTERING_CONTRACT = CONTRACT;
export const AVANTIQO_FINAL_MASTERING_QC_CONTRACT = QC_CONTRACT;
export const AVANTIQO_FINAL_MASTERING_SEAL_CONTRACT = SEAL_CONTRACT;
