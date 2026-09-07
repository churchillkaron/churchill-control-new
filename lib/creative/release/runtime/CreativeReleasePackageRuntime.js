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
import {
  currentCreativePrimaryMaster,
  newestCreativeNode,
} from "@/lib/creative/release/runtime/CreativeMasterVersionRuntime";

const CONTRACT = "CREATIVE_RELEASE_PACKAGE_V3";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function deliveryKey(value) {
  return text(value).toLowerCase();
}

function latestEvidence(nodes, renderId, source) {
  return newestCreativeNode(nodes, (node) =>
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

function packageIdentity({
  readiness,
  finalMastering,
  deliveryReport,
  master,
  derivatives,
}) {
  return digest({
    contract: CONTRACT,
    readiness_id: readiness.id,
    readiness_identity: readiness.metadata?.release_readiness_identity || null,
    final_mastering_report_id: finalMastering.id,
    final_mastering_identity:
      finalMastering.metadata?.final_mastering_identity || null,
    final_mastering_seal_hash:
      finalMastering.metadata?.final_mastering_seal_hash || null,
    master: {
      id: master.id,
      render_identity: master.metadata?.render_identity || null,
      checksum: master.technical?.checksum || null,
      updated_at: master.updated_at || null,
    },
    channel_delivery_identity:
      deliveryReport.metadata?.temporal_channel_delivery_identity || null,
    derivatives: derivatives.map((entry) => ({
      channel: entry.channel,
      profile_id: entry.profile_id,
      render_asset_node_id: entry.render_asset_node_id,
      checksum: entry.checksum,
      source_final_master_checksum: entry.source_final_master_checksum,
      source_final_mastering_seal_hash:
        entry.source_final_mastering_seal_hash,
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

    const master = currentCreativePrimaryMaster(nodes);
    if (!master?.url) throw new Error("CURRENT_RELEASE_MASTER_REQUIRED");
    if (!master.technical?.checksum) {
      throw new Error("CURRENT_RELEASE_MASTER_CHECKSUM_REQUIRED");
    }

    const readiness = newestCreativeNode(nodes, (node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT &&
      node.metadata?.passed === true &&
      node.metadata?.final_render_asset_node_id === master.id,
    );
    if (!readiness) throw new Error("CURRENT_MASTER_RELEASE_READINESS_REQUIRED");

    const finalMastering = newestCreativeNode(nodes, (node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
      node.lineage?.source === "final_mastering_certification" &&
      node.parent_asset_node_id === master.id &&
      node.metadata?.passed === true &&
      node.metadata?.master_checksum === master.technical.checksum &&
      Boolean(node.metadata?.final_mastering_seal_hash),
    );
    if (!finalMastering) {
      throw new Error("CURRENT_MASTER_FINAL_MASTERING_SEAL_REQUIRED");
    }

    const finalMasteringSealHash =
      finalMastering.metadata?.final_mastering_seal_hash || null;
    const deliveryReport = newestCreativeNode(nodes, (node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
      node.lineage?.source === "temporal_channel_delivery" &&
      node.parent_asset_node_id === master.id &&
      node.metadata?.passed === true &&
      node.metadata?.master_checksum === master.technical.checksum &&
      node.metadata?.final_mastering_report_id === finalMastering.id &&
      node.metadata?.final_mastering_seal_hash === finalMasteringSealHash,
    );
    if (!deliveryReport) {
      throw new Error("PASSED_CHANNEL_DELIVERY_BOUND_TO_CURRENT_MASTER_REQUIRED");
    }

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
      if (
        delivery.source_final_master_asset_node_id !== master.id ||
        delivery.source_final_master_checksum !== master.technical.checksum ||
        delivery.source_final_mastering_report_id !== finalMastering.id ||
        delivery.source_final_mastering_seal_hash !== finalMasteringSealHash
      ) {
        failed.push({ channel, reason: "DERIVATIVE_FINAL_MASTER_BINDING_INVALID" });
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
      if (
        render.metadata?.release_derivative !== true ||
        render.metadata?.source_final_master_asset_node_id !== master.id ||
        render.metadata?.source_final_master_checksum !== master.technical.checksum ||
        render.metadata?.source_final_mastering_report_id !== finalMastering.id ||
        render.metadata?.source_final_mastering_seal_hash !== finalMasteringSealHash
      ) {
        failed.push({ channel, reason: "DERIVATIVE_PROVENANCE_REQUIRED" });
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
        source_final_master_asset_node_id: master.id,
        source_final_master_checksum: master.technical.checksum,
        source_final_mastering_report_id: finalMastering.id,
        source_final_mastering_seal_hash: finalMasteringSealHash,
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

    const identity = packageIdentity({
      readiness,
      finalMastering,
      deliveryReport,
      master,
      derivatives,
    });
    const existing = nodes.find((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.RELEASE_PACKAGE &&
      node.metadata?.release_package_identity === identity,
    );
    if (existing) {
      return {
        contract: CONTRACT,
        passed: true,
        package: existing,
        reused: true,
      };
    }

    const manifest = {
      contract: "AVANTIQO_RELEASE_MANIFEST_V1",
      release_package_identity: identity,
      master: {
        asset_node_id: master.id,
        checksum: master.technical.checksum,
        final_mastering_report_id: finalMastering.id,
        final_mastering_identity:
          finalMastering.metadata?.final_mastering_identity || null,
        final_mastering_seal_hash: finalMasteringSealHash,
        source_limitations:
          finalMastering.metadata?.source_limitations || null,
      },
      readiness: {
        report_id: readiness.id,
        identity: readiness.metadata?.release_readiness_identity || null,
      },
      channel_delivery: {
        report_id: deliveryReport.id,
        identity:
          deliveryReport.metadata?.temporal_channel_delivery_identity || null,
      },
      derivatives,
      publication_authorized: false,
    };
    const manifestHash = digest(manifest);

    const node = createCreativeAssetNode({
      organization_id,
      creative_project_id,
      parent_asset_node_id: readiness.id,
      type: CREATIVE_ASSET_NODE_TYPES.RELEASE_PACKAGE,
      status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: `${project.name || "Creative project"} release package`,
      description:
        "Immutable release package binding the exact final-master checksum and mastering seal to every governed channel derivative, conformance report, audio report and authenticated release-readiness decision.",
      lineage: {
        source: "release_package_certification",
        capability: "creative.release.package.certify",
        generation_version: 3,
      },
      intelligence: {
        quality_score: 100,
        safety_status: "REVIEW_REQUIRED",
        tags: [
          "release-package",
          "immutable",
          "final-master-sealed",
          "channel-derivatives",
          "checksums",
          "release-manifest",
        ],
      },
      reuse: { reusable: false, approved_for_reuse: false },
      review: {
        ai_reviewed: true,
        human_reviewed: false,
        approved: false,
        notes: "Machine-certified package evidence. Publication still requires separate authenticated human approval.",
      },
      metadata: {
        contract: CONTRACT,
        certified: true,
        release_package_identity: identity,
        release_manifest_contract: manifest.contract,
        release_manifest: manifest,
        release_manifest_hash: manifestHash,
        release_readiness_report_id: readiness.id,
        release_readiness_identity: readiness.metadata?.release_readiness_identity || null,
        final_mastering_report_id: finalMastering.id,
        final_mastering_identity:
          finalMastering.metadata?.final_mastering_identity || null,
        final_mastering_seal_hash: finalMasteringSealHash,
        channel_delivery_report_id: deliveryReport.id,
        channel_delivery_identity: deliveryReport.metadata?.temporal_channel_delivery_identity || null,
        master_render_asset_node_id: master.id,
        master_render_identity: master.metadata?.render_identity || null,
        master_checksum: master.technical.checksum,
        master_updated_at: master.updated_at || null,
        master_source_limitations:
          finalMastering.metadata?.source_limitations || null,
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
      manifest,
      manifest_hash: manifestHash,
      reused: !claimed.created,
    };
  },
});
