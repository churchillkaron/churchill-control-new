import crypto from "node:crypto";
import { createCreativeAssetNode, CREATIVE_ASSET_NODE_STATUS, CREATIVE_ASSET_NODE_TYPES } from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";

const CONTRACT = "CREATIVE_STILL_RELEASE_CERTIFICATION_V1";
const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function channelKey(value) {
  return text(value).toLowerCase();
}

function configuredChannels(project = {}) {
  return [...new Set([
    ...list(project.target_channels).map(channelKey),
    ...list(project.metadata?.publish_targets).map((target) =>
      channelKey(target?.channel || target?.id || target?.key),
    ),
  ].filter(Boolean))];
}

function masterIdentity(input = {}) {
  return digest({
    contract: CONTRACT,
    project_id: input.creative_project_id,
    creative_asset_id: input.creative_asset_id,
    checksum: input.checksum,
    artboard_id: input.artboard_id,
    quality_score: input.quality_preflight?.score ?? null,
  });
}
async function createOrReuse(node, key, value) {
  const existing = (await AssetGraphRepository.listByProject({
    organization_id: node.organization_id,
    creative_project_id: node.creative_project_id,
  })).find((candidate) =>
    candidate.type === node.type &&
    candidate.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED &&
    candidate.metadata?.[key] === value,
  );
  if (existing) return existing;
  const claimed = await AssetGraphRepository.createOrFindByMetadataIdentity({
    node,
    metadata_key: key,
    metadata_value: value,
  });
  return claimed.node;
}

export const CreativeStillReleaseCertificationRuntime = Object.freeze({
  contract: CONTRACT,

  async certify(input = {}) {
    const organizationId = text(input.organization_id);
    const projectId = text(input.creative_project_id);
    const assetId = text(input.creative_asset_id);
    const reference = text(input.storage_reference || input.file_url || input.url);
    const checksum = text(input.checksum);

    if (!organizationId) throw new Error("organization_id required");
    if (!projectId) throw new Error("creative_project_id required");
    if (!assetId) throw new Error("creative_asset_id required");
    if (!reference) throw new Error("STILL_RELEASE_STORAGE_REFERENCE_REQUIRED");
    if (!checksum) throw new Error("STILL_RELEASE_CHECKSUM_REQUIRED");
    if (input.quality_preflight?.release_ready !== true) {
      throw new Error("STILL_RELEASE_PREFLIGHT_REQUIRED");
    }

    const project = await CreativeProjectRepository.getById(projectId);
    if (!project || text(project.organization_id) !== organizationId) {
      throw new Error("Creative project not found");
    }
    const channels = configuredChannels(project);
    if (!channels.length) {
      return {
        contract: CONTRACT,
        passed: false,
        blocker: "STILL_RELEASE_CHANNELS_REQUIRED",
        channels: [],
      };
    }

    const renderIdentity = masterIdentity({
      creative_project_id: projectId,
      creative_asset_id: assetId,
      checksum,
      artboard_id: input.artboard_id,
      quality_preflight: input.quality_preflight,
    });
    const master = await createOrReuse(createCreativeAssetNode({
      organization_id: organizationId,
      creative_project_id: projectId,
      creative_asset_id: assetId,
      type: CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
      status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: input.name || "Image Studio release master",
      description: "Deterministic still-image release master from Image Studio.",
      url: reference,
      technical: {
        mime_type: input.mime_type || null,
        width: Number(input.width) || null,
        height: Number(input.height) || null,
        checksum,
      },
      lineage: {
        source: "image_studio_release_master",
        capability: "creative.still.release.certify",
        generation_version: 1,
      },
      metadata: {
        render_identity: renderIdentity,
        image_studio_master: true,
        artboard_id: input.artboard_id || null,
        quality_preflight: input.quality_preflight,
        technical_qc: { passed: true, source: input.quality_preflight?.contract || "CREATIVE_IMAGE_STUDIO_QUALITY_PREFLIGHT_V1" },
        release_derivative: false,
      },
    }), "render_identity", renderIdentity);
    const readinessIdentity = digest({
      contract: CONTRACT,
      kind: "still-release-readiness",
      master_id: master.id,
      master_checksum: checksum,
      quality_preflight: input.quality_preflight,
      channels,
    });
    const readiness = await createOrReuse(createCreativeAssetNode({
      organization_id: organizationId,
      creative_project_id: projectId,
      parent_asset_node_id: master.id,
      type: CREATIVE_ASSET_NODE_TYPES.RELEASE_READINESS_REPORT,
      status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: `${project.name || "Creative project"} still release readiness`,
      description: "Still-image release readiness bound to the exact Image Studio master checksum and quality preflight.",
      lineage: {
        source: "image_studio_release_readiness",
        capability: "creative.still.release.readiness",
        generation_version: 1,
      },
      review: { ai_reviewed: true, human_reviewed: false, approved: false },
      metadata: {
        release_readiness_identity: readinessIdentity,
        final_render_asset_node_id: master.id,
        passed: true,
        checks: [{ id: "image_studio_preflight", required: true, passed: true }],
        failed_checks: [],
        quality_preflight: input.quality_preflight,
        evaluated_at: new Date().toISOString(),
      },
    }), "release_readiness_identity", readinessIdentity);

    const derivatives = [];
    for (const channel of channels) {
      const derivativeIdentity = digest({
        contract: CONTRACT,
        kind: "still-channel-derivative",
        master_id: master.id,
        master_checksum: checksum,
        channel,
      });
      const derivative = await createOrReuse(createCreativeAssetNode({
        organization_id: organizationId,
        creative_project_id: projectId,
        parent_asset_node_id: master.id,
        type: CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
        status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
        name: `${project.name || "Creative project"} ${channel} derivative`,
        description: "Immutable still-image delivery derivative bound to the exact Image Studio release master.",
        url: reference,
        technical: {
          mime_type: input.mime_type || null,
          width: Number(input.width) || null,
          height: Number(input.height) || null,
          checksum,
        },
        lineage: {
          source: "image_studio_channel_derivative",
          capability: "creative.still.release.derivative",
          generation_version: 1,
        },
        metadata: {
          render_identity: derivativeIdentity,
          release_derivative: true,
          delivery_channel: channel,
          source_final_master_asset_node_id: master.id,
          source_final_master_checksum: checksum,
          image_studio_master: true,
          quality_preflight: input.quality_preflight,
        },
      }), "render_identity", derivativeIdentity);
      derivatives.push({
        channel,
        profile_id: `image-studio-${channel}`,
        render_asset_node_id: derivative.id,
        checksum,
        width: Number(input.width) || null,
        height: Number(input.height) || null,
        source_final_master_asset_node_id: master.id,
        source_final_master_checksum: checksum,
      });
    }

    const packageIdentity = digest({
      contract: CONTRACT,
      kind: "still-release-package",
      readiness_identity: readinessIdentity,
      master_id: master.id,
      master_checksum: checksum,
      derivatives,
    });
    const releasePackage = await createOrReuse(createCreativeAssetNode({
      organization_id: organizationId,
      creative_project_id: projectId,
      parent_asset_node_id: readiness.id,
      type: CREATIVE_ASSET_NODE_TYPES.RELEASE_PACKAGE,
      status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: `${project.name || "Creative project"} still release package`,
      description: "Immutable still-image release package bound to the exact master and channel derivatives.",
      lineage: {
        source: "image_studio_release_package",
        capability: "creative.still.release.package.certify",
        generation_version: 1,
      },
      review: { ai_reviewed: true, human_reviewed: false, approved: false },
      metadata: {
        contract: CONTRACT,
        certified: true,
        immutable: true,
        release_package_identity: packageIdentity,
        release_readiness_report_id: readiness.id,
        release_readiness_identity: readinessIdentity,
        master_render_asset_node_id: master.id,
        master_render_identity: renderIdentity,
        master_checksum: checksum,
        derivative_count: derivatives.length,
        channels,
        derivatives,
        publication_authorized: false,
        certified_at: new Date().toISOString(),
      },
    }), "release_package_identity", packageIdentity);

    return {
      contract: CONTRACT,
      passed: true,
      master,
      readiness,
      package: releasePackage,
      derivatives,
      channels,
    };
  },
});
