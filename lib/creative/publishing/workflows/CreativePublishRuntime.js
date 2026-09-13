import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { resolveOrganizationChannels } from "@/lib/platform/channels/resolver/ChannelConnectionResolver";
import { CreativeChannelExecutionRuntime } from "@/lib/creative/publishing/runtime/CreativeChannelExecutionRuntime";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function publishCapable(channel = {}) {
  return list(channel.capabilities).some((capability) => /(?:^|\.)publish(?:$|\.)/i.test(text(capability)));
}

function connectedPublishChannels(channels = []) {
  return channels.filter((channel) => channel.connected === true && publishCapable(channel)).map((channel) => channel.id);
}

function requestedProjectChannels(project = {}) {
  return [...list(project.target_channels), ...list(project.metadata?.channels), ...list(project.metadata?.target_channels), ...list(project.metadata?.publication_channels)].map(text).filter(Boolean);
}

function unique(values = []) {
  return [...new Set(values)];
}

function assertConnected(requested = [], available = []) {
  const availableSet = new Set(available);
  const unavailable = requested.filter((channel) => !availableSet.has(channel));
  if (unavailable.length) throw new Error(`CREATIVE_PUBLICATION_CHANNEL_NOT_CONNECTED:${unavailable.join(",")}`);
}

export const CreativePublishRuntime = {
  async buildPublication({ organization_id, creative_project_id }) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const [project, assets, organizationChannels] = await Promise.all([
      CreativeProjectRepository.getById(creative_project_id),
      CreativeAssetGraphRuntime.list({ organization_id, creative_project_id }),
      resolveOrganizationChannels({ organization_id }),
    ]);

    if (!project || project.organization_id !== organization_id) throw new Error("Creative project not found");

    const publishable = assets.filter((asset) => asset.status === "READY" || asset.status === "APPROVED");
    return {
      project,
      organization_channels: organizationChannels,
      planned_channels: unique(requestedProjectChannels(project)),
      available_channels: connectedPublishChannels(organizationChannels),
      assets: publishable,
      total: publishable.length,
    };
  },

  async publish(input = {}) {
    const organization_id = text(input.organization_id);
    const creative_project_id = text(input.creative_project_id);
    const publication = await this.buildPublication({ organization_id, creative_project_id });
    const explicitChannels = unique(list(input.channels).map(text).filter(Boolean));
    const requestedChannels = explicitChannels.length ? explicitChannels : publication.planned_channels;

    if (!requestedChannels.length) throw new Error("CREATIVE_PUBLICATION_CHANNELS_REQUIRED");
    assertConnected(requestedChannels, publication.available_channels);

    const assetIds = publication.assets.map((asset) => asset.id);
    const projectMetadata = object(publication.project?.metadata);
    const queued = await CreativeChannelExecutionRuntime.queue({
      ...input,
      organization_id,
      creative_project_id,
      channels: requestedChannels,
      creative_asset_node_ids: assetIds,
      campaign: { ...object(projectMetadata.campaign), ...object(input.campaign) },
      audience: { ...object(projectMetadata.audience), ...object(input.audience) },
      budget: { ...object(projectMetadata.budget), ...object(input.budget) },
      schedule: { ...object(projectMetadata.schedule), ...object(input.schedule) },
      placement: { ...object(projectMetadata.placement), ...object(input.placement) },
      call_to_action: { ...object(projectMetadata.call_to_action), ...object(input.call_to_action) },
      tracking: { ...object(projectMetadata.tracking), ...object(input.tracking) },
      content: { ...object(projectMetadata.content), ...object(input.content) },
      channel_settings: { ...object(projectMetadata.channel_settings), ...object(input.channel_settings) },
      conversation_context: object(input.conversation_context),
      evidence: object(input.evidence),
      requested_by: object(input.requested_by),
    });

    return {
      success: true,
      channels: requestedChannels,
      available_channels: publication.available_channels,
      assets: assetIds,
      publish_job_ids: queued.publish_job_ids,
      total: publication.assets.length,
      status: queued.status,
      execution_contract: queued.contract,
    };
  },
};
