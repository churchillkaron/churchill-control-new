import crypto from "node:crypto";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";

const CONTRACT = "CREATIVE_RELEASE_PACKAGE_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function timestamp(node = {}) {
  return Date.parse(node.updated_at || node.created_at || 0) || 0;
}

function newest(nodes = [], predicate = () => true) {
  return [...nodes].filter(predicate).sort((a, b) => timestamp(b) - timestamp(a))[0] || null;
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function deliveryKey(value) {
  return text(value).toLowerCase();
}

function latestEvidence(nodes, renderId, source) {
  return newest(nodes, (node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
    node.parent_asset_node_id === renderId &&
    node.lineage?.source === source,
  );
}

function passed(node) {
  return Boolean(
    node &&
    node.status !== CREATIVE_ASSET_NODE_STATUS.REJECTED &&
    node.metadata?.passed === true,
  );
}

function packageIdentity({ readiness, deliveryReport, master, derivatives }) {
  return digest({
    contract: CONTRACT,
    readiness_id: readiness.id,
    readiness_identity: readiness.metadata?.release_readiness_identity || null,
    master: {
      id: master.id,
      render_identity: master.metadata?.render_identity || null,
      checksum: master.technical?.checksum || null,
    },
    channel_delivery_identity:
      deliveryReport.metadata?.temporal_channel_delivery_identity || null,
    derivatives: derivatives.map((entry) => ({
      channel: entry.channel,
      profile_id: entry.profile_id,
      render_asset_node_id: entry.render_asset_node_id,
      checksum: entry.checksum,
      conformance_report_id: entry.conformance_report_id,
      delivery_audio_report_id: entry.delivery_audio_report_id,
    })),
  });
}

export const CreativeReleasePackageRuntime = Object.freeze({
  contract: CONTRACT,

  async certify({ organization_id, creative_project_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const [project, nodes] = await Promise.all([
      CreativeProjectRepository.getById(creative_project_id),
      AssetGraphRepository.listByProject({ organization_id, creative_project_id }),
    ]);
    if (!project || text(project.organization_id) !== text(organization_id)) {
      throw new Error("Creative project not found");
    }

    const readiness = newest(nodes, (node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT &&
      node.metadata?.passed === true,
    );
    if (!readiness) throw new Error("PASSED_RELEASE_READINESS_REQUIRED");

    const masterId = readiness.metadata?.final_render_asset_node_id;
    const master = nodes.find((node) =>
      node.id === masterId &&
      node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
    );
    if (!master?.url) throw new Error("CURRENT_RELEASE_MASTER_REQUIRED");

    const deliveryReport = newest(nodes, (node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
      node.lineage?.source === "temporal_channel_delivery" &&
      node.parent_asset_node_id === master.id &&
      node.metadata?.passed === true,
    );
    if (!deliveryReport) throw new Error("PASSED_CHANNEL_DELIVERY_REQUIRED");

    const configuredChannels = [...new Set([
      ...list(project.target_channels).map(deliveryKey),
      ...list(project.metadata?.publish_targets).map((target) =>
        deliveryKey(target?.channel || target?.id || target?.key),
      ),
    ].filter(Boolean))];

    const deliveries = list(deliveryReport.metadata?.deliveries);
    const derivatives = [];
    const failed = [];

    for (const channel of configuredChannels) {
      const delivery = deliveries.find((entry) => deliveryKey(entry.channel) === channel);
      if (!delivery?.passed || !delivery.render_asset_node_id) {
        failed.push({ channel, reason: "CHANNEL_DERIVATIVE_REQUIRED" });
        continue;
      }
      const render = nodes.find((node) =>
        node.id === delivery.render_asset_node_id &&
        node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
      );
      if (!render?.url || !render.technical?.checksum) {
        failed.push({ channel, reason: "DERIVATIVE_MEDIA_OR_CHECKSUM_REQUIRED" });
        continue;
      }

      const conformance = latestEvidence(nodes, render.id, "delivery_master_conformance");
      const audio = latestEvidence(nodes, render.id, "delivery_audio_qc");
      const strictRequired = render.metadata?.delivery_master_conformance_required === true;
      const audioRequired = render.metadata?.delivery_audio_qc_required === true;

      if (strictRequired && !passed(conformance)) {
        failed.push({ channel, reason: "DERIVATIVE_CONFORMANCE_REQUIRED" });
        continue;
      }
      if (audioRequired && !passed(audio)) {
        failed.push({ channel, reason: "DERIVATIVE_DELIVERY_AUDIO_REQUIRED" });
        continue;
      }

      derivatives.push({
        channel,
        profile_id: delivery.profile_id || render.metadata?.export_profile?.id || null,
        profile_source: delivery.profile_source || null,
        render_asset_node_id: render.id,
        checksum: render.technical.checksum,
        width: render.technical?.width || delivery.width || null,
        height: render.technical?.height || delivery.height || null,
        frame_rate: render.technical?.frame_rate || delivery.frame_rate || null,
        conformance_required: strictRequired,
        conformance_report_id: conformance?.id || null,
        delivery_audio_required: audioRequired,
        delivery_audio_report_id: audio?.id || null,
      });
    }

    if (!configuredChannels.length) {
      throw new Error("RELEASE_PACKAGE_CHANNELS_REQUIRED");
    }
    if (failed.length || derivatives.length !== configuredChannels.length) {
      return {
        contract: CONTRACT,
        passed: false,
        blocker: "RELEASE_PACKAGE_INCOMPLETE",
        failed,
        derivatives,
      };
    }

    const identity = packageIdentity({ readiness, deliveryReport, master, derivatives });
    const existing = nodes.find((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_PACKAGE &&
      node.metadata?.release_package_identity === identity,
    );
    if (existing) return { contract: CONTRACT, passed: true, package: existing, reused: true };

    const node = createCreativeAssetNode({
      organization_id,
      creative_project_id,
      parent_asset_node_id: readiness.id,
      type: CREATIVE_ASSET_NODE_TYPES.RELEASE_PACKAGE,
      status: CREATIVE_ASSET_NODE_STATUS.APPROVED,
      name: `${project.name || "Creative project"} release package`,
      description:
        "Immutable release package binding the approved creative master to every governed channel derivative and its current delivery evidence.",
      lineage: {
        source: "release_package_certification",
        capability: "creative.release.package.certify",
        generation_version: 1,
      },
      intelligence: {
        quality_score: 100,
        safety_status: "APPROVED",
        tags: ["release-package", "immutable", "channel-derivatives", "checksums"],
      },
      reuse: { reusable: false, approved_for_reuse: false },
      review: {
        ai_reviewed: true,
        human_reviewed: true,
        approved: true,
        notes: "Package certifies existing approved evidence only; it does not authorize publication.",
      },
      metadata: {
        contract: CONTRACT,
        release_package_identity: identity,
        release_readiness_report_id: readiness.id,
        release_readiness_identity: readiness.metadata?.release_readiness_identity || null,
        channel_delivery_report_id: deliveryReport.id,
        channel_delivery_identity: deliveryReport.metadata?.temporal_channel_delivery_identity || null,
        master_render_asset_node_id: master.id,
        master_render_identity: master.metadata?.render_identity || null,
        master_checksum: master.technical?.checksum || null,
        derivative_count: derivatives.length,
        channels: configuredChannels,
        derivatives,
        publication_authorized: false,
        immutable: true,
        certified_at: new Date().toISOString(),
      },
    });

    const claimed = await AssetGraphRepository.createOrFindByMetadataIdentity({
      node,
      metadata_key: "release_package_identity",
      metadata_value: identity,
    });

    return {
      contract: CONTRACT,
      passed: true,
      package: claimed.node,
      reused: !claimed.created,
    };
  },
});
