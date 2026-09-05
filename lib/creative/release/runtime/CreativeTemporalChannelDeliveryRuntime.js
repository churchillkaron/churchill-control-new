import crypto from "node:crypto";

import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import {
  CreativeExportProfileResolver,
} from "@/lib/creative/post-production/runtime/CreativeExportProfileResolver";
import {
  CreativeEdlRenderRuntime,
} from "@/lib/creative/post-production/runtime/CreativeEdlRenderRuntime";
import {
  CreativeDeliveryAudioQualityRuntime,
} from "@/lib/creative/quality/runtime/CreativeDeliveryAudioQualityRuntime";
import {
  CreativeDeliveryMasterConformanceRuntime,
} from "@/lib/creative/quality/runtime/CreativeDeliveryMasterConformanceRuntime";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

const CONTRACT = "CREATIVE_TEMPORAL_CHANNEL_DELIVERY_V2";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !["created_at", "updated_at"].includes(key))
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

function uniqueChannels(project = {}) {
  return [...new Set(
    list(project.target_channels)
      .map((value) => text(value))
      .filter(Boolean),
  )];
}

function baseDeliveryPassed(result = {}) {
  const render = object(result.render);
  const qc = object(result.technical_qc);
  const finalAudio = object(result.professional_final_audio_integrity);
  const finishing = object(result.professional_finishing);
  const audioRequired =
    render.metadata?.master_soundtrack_asset_node_id ||
    render.metadata?.master_soundtrack_contract_hash;

  return Boolean(
    render.id &&
    render.url &&
    render.status !== CREATIVE_ASSET_NODE_STATUS.REJECTED &&
    qc.passed === true &&
    (!finishing.contract || finishing.passed !== false) &&
    (!audioRequired || finalAudio.passed === true ||
      render.metadata?.final_master_audio_verified === true),
  );
}

async function verifyDerivative({ organization_id, render }) {
  const conformanceInspection = await CreativeDeliveryMasterConformanceRuntime.inspect({
    organization_id,
    render_asset_node_id: render.id,
  });
  const conformance = conformanceInspection.required
    ? await CreativeDeliveryMasterConformanceRuntime.analyze({
        organization_id,
        render_asset_node_id: render.id,
      })
    : { skipped: true, report: conformanceInspection.report || null };
  const conformanceFinal = await CreativeDeliveryMasterConformanceRuntime.inspect({
    organization_id,
    render_asset_node_id: render.id,
  });

  const audioInspection = await CreativeDeliveryAudioQualityRuntime.inspect({
    organization_id,
    render_asset_node_id: render.id,
  });
  const audio = audioInspection.required
    ? await CreativeDeliveryAudioQualityRuntime.analyze({
        organization_id,
        render_asset_node_id: render.id,
      })
    : { skipped: true, report: audioInspection.report || null };
  const audioFinal = await CreativeDeliveryAudioQualityRuntime.inspect({
    organization_id,
    render_asset_node_id: render.id,
  });

  return {
    conformance,
    conformance_final: conformanceFinal,
    audio,
    audio_final: audioFinal,
    passed: Boolean(
      (!conformanceFinal.required || conformanceFinal.passed === true) &&
      (!audioFinal.required || audioFinal.passed === true),
    ),
  };
}

async function persistReport({
  organization_id,
  creative_project_id,
  timeline,
  master_render,
  deliveries,
} = {}) {
  const identity = digest({
    contract: CONTRACT,
    timeline_asset_node_id: timeline.id,
    master_render_asset_node_id: master_render.id,
    deliveries: deliveries.map((delivery) => ({
      channel: delivery.channel,
      profile_id: delivery.profile_id,
      render_asset_node_id: delivery.render_asset_node_id,
      render_checksum: delivery.render_checksum,
      passed: delivery.passed,
      conformance_report_id: delivery.conformance_report_id,
      delivery_audio_report_id: delivery.delivery_audio_report_id,
    })),
  });
  const nodes = await AssetGraphRepository.listByProject({
    organization_id,
    creative_project_id,
  });
  const existing = nodes.find((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
    node.metadata?.temporal_channel_delivery_identity === identity,
  );
  if (existing) return existing;

  const passed = deliveries.length > 0 && deliveries.every((delivery) => delivery.passed);
  return AssetGraphRepository.create(createCreativeAssetNode({
    organization_id,
    creative_project_id,
    parent_asset_node_id: master_render.id,
    type: CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT,
    status: passed
      ? CREATIVE_ASSET_NODE_STATUS.REVIEW
      : CREATIVE_ASSET_NODE_STATUS.REJECTED,
    name: `${master_render.name || "Master film"} channel delivery report`,
    description:
      "Deterministic delivery proof for every configured target channel, including export-profile resolution, technical QC, professional finishing, exact-file conformance, delivery audio and final-master audio integrity.",
    lineage: {
      source: "temporal_channel_delivery",
      capability: "creative.render.delivery.channels",
      generation_version: 2,
    },
    intelligence: {
      quality_score: passed ? 100 : 0,
      safety_status: passed ? "REVIEW_REQUIRED" : "REJECTED",
      tags: ["channel-delivery", "deterministic", "technical-qc", "delivery-conformance", "delivery-audio"],
    },
    reuse: { reusable: false, approved_for_reuse: false },
    review: {
      ai_reviewed: false,
      human_reviewed: false,
      approved: false,
      notes: passed
        ? "Every configured target-channel derivative passed deterministic and profile-governed delivery checks."
        : "One or more configured target-channel derivatives failed delivery checks.",
    },
    metadata: {
      contract: CONTRACT,
      temporal_channel_delivery_identity: identity,
      timeline_asset_node_id: timeline.id,
      master_render_asset_node_id: master_render.id,
      passed,
      delivery_count: deliveries.length,
      failed_channels: deliveries.filter((delivery) => !delivery.passed)
        .map((delivery) => delivery.channel),
      deliveries,
      provider_calls_executed: 0,
      deterministic_rendering_only: true,
      publication_authorized: false,
      evaluated_at: new Date().toISOString(),
    },
  }));
}

export const CreativeTemporalChannelDeliveryRuntime = Object.freeze({
  contract: CONTRACT,

  async deliver({
    organization_id,
    creative_project_id,
    post_production = {},
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    const timeline = post_production.timeline;
    const masterRender = post_production.render;
    if (!timeline?.id) throw new Error("TEMPORAL_CHANNEL_DELIVERY_TIMELINE_REQUIRED");
    if (!masterRender?.id) throw new Error("TEMPORAL_CHANNEL_DELIVERY_MASTER_RENDER_REQUIRED");

    const project = await CreativeProjectRepository.getById(creative_project_id);
    if (!project || text(project.organization_id) !== text(organization_id)) {
      throw new Error("Creative project not found");
    }

    const channels = uniqueChannels(project);
    if (!channels.length) {
      return {
        contract: CONTRACT,
        passed: false,
        status: "BLOCKED",
        blocker: "TARGET_CHANNELS_REQUIRED",
        deliveries: [],
        provider_calls_executed: 0,
      };
    }

    const deliveries = [];
    for (const channel of channels) {
      try {
        const resolved = await CreativeExportProfileResolver.resolve({
          organization_id,
          timeline_asset_node_id: timeline.id,
          channel,
        });
        const rendered = await CreativeEdlRenderRuntime.render({
          organization_id,
          timeline_asset_node_id: timeline.id,
          export_profile: resolved.profile,
          tracks: post_production.tracks || {},
          policy: object(project.metadata?.post_production?.render),
        });
        const render = rendered.render;
        const governed = render?.id
          ? await verifyDerivative({ organization_id, render })
          : { passed: false, conformance_final: null, audio_final: null };
        const passed = baseDeliveryPassed(rendered) && governed.passed;
        deliveries.push({
          channel,
          passed,
          profile_id: text(resolved.profile?.id || resolved.profile?.name) || null,
          profile_source: resolved.source,
          width: Number(resolved.profile?.width || 0) || null,
          height: Number(resolved.profile?.height || 0) || null,
          frame_rate: Number(resolved.profile?.frame_rate || resolved.profile?.fps || 0) || null,
          render_asset_node_id: render?.id || null,
          render_url: render?.url || null,
          render_checksum: render?.technical?.checksum || null,
          technical_qc_passed: rendered.technical_qc?.passed === true,
          professional_finishing_contract:
            render?.metadata?.professional_finishing_contract ||
            rendered.professional_finishing?.contract || null,
          final_master_audio_verified: Boolean(
            render?.metadata?.final_master_audio_verified === true ||
            rendered.professional_final_audio_integrity?.passed === true,
          ),
          conformance_required: governed.conformance_final?.required === true,
          conformance_passed: governed.conformance_final?.passed === true,
          conformance_report_id: governed.conformance_final?.report?.id || null,
          delivery_audio_required: governed.audio_final?.required === true,
          delivery_audio_passed: governed.audio_final?.passed === true,
          delivery_audio_report_id: governed.audio_final?.report?.id || null,
          error: passed
            ? null
            : governed.passed
              ? "CHANNEL_DELIVERY_INTEGRITY_FAILED"
              : governed.conformance_final?.blocker ||
                governed.audio_final?.blocker ||
                "CHANNEL_DELIVERY_PROFILE_QC_FAILED",
        });
      } catch (error) {
        deliveries.push({
          channel,
          passed: false,
          profile_id: null,
          profile_source: null,
          render_asset_node_id: null,
          render_url: null,
          render_checksum: null,
          technical_qc_passed: false,
          professional_finishing_contract: null,
          final_master_audio_verified: false,
          conformance_required: false,
          conformance_passed: false,
          conformance_report_id: null,
          delivery_audio_required: false,
          delivery_audio_passed: false,
          delivery_audio_report_id: null,
          error: error?.message || String(error),
        });
      }
    }

    const report = await persistReport({
      organization_id,
      creative_project_id,
      timeline,
      master_render: masterRender,
      deliveries,
    });
    const passed = deliveries.length > 0 && deliveries.every((delivery) => delivery.passed);

    return {
      contract: CONTRACT,
      passed,
      status: passed ? "READY_FOR_RELEASE_APPROVAL" : "BLOCKED",
      target_channels: channels,
      deliveries,
      report,
      provider_calls_executed: 0,
      publication_authorized: false,
    };
  },
});
