import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import {
  resolveOrganizationChannels,
} from "@/lib/platform/channels/resolver/ChannelConnectionResolver";
import {
  PublishingRuntime,
} from "@/lib/creative/publishing/runtime/PublishingRuntime";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function publishCapable(channel = {}) {
  return list(channel.capabilities).some((capability) =>
    /(?:^|\.)publish(?:$|\.)/i.test(text(capability)),
  );
}

function connectedPublishChannels(channels = []) {
  return channels
    .filter((channel) => channel.connected === true && publishCapable(channel))
    .map((channel) => channel.id);
}

function requestedProjectChannels(project = {}) {
  return [
    ...list(project.target_channels),
    ...list(project.metadata?.channels),
    ...list(project.metadata?.target_channels),
    ...list(project.metadata?.publication_channels),
  ].map(text).filter(Boolean);
}

function unique(values = []) {
  return [...new Set(values)];
}

function assertConnected(requested = [], available = []) {
  const availableSet = new Set(available);
  const unavailable = requested.filter((channel) => !availableSet.has(channel));
  if (unavailable.length) {
    throw new Error(
      `CREATIVE_PUBLICATION_CHANNEL_NOT_CONNECTED:${unavailable.join(",")}`,
    );
  }
}

export const CreativePublishRuntime = {
  async buildPublication({
    organization_id,
    creative_project_id,
  }) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const [project, assets, organizationChannels] = await Promise.all([
      CreativeProjectRepository.getById(creative_project_id),
      CreativeAssetGraphRuntime.list({
        organization_id,
        creative_project_id,
      }),
      resolveOrganizationChannels({ organization_id }),
    ]);

    if (!project || project.organization_id !== organization_id) {
      throw new Error("Creative project not found");
    }

    const publishable = assets.filter(
      (asset) => asset.status === "READY" || asset.status === "APPROVED",
    );
    const availableChannels = connectedPublishChannels(organizationChannels);
    const plannedChannels = unique(requestedProjectChannels(project));

    return {
      planned_channels: plannedChannels,
      available_channels: availableChannels,
      assets: publishable,
      total: publishable.length,
    };
  },

  async publish({
    organization_id,
    creative_project_id,
    channels = [],
  }) {
    const publication = await this.buildPublication({
      organization_id,
      creative_project_id,
    });

    const explicitChannels = unique(list(channels).map(text).filter(Boolean));
    const requestedChannels = explicitChannels.length
      ? explicitChannels
      : publication.planned_channels;

    if (!requestedChannels.length) {
      throw new Error("CREATIVE_PUBLICATION_CHANNELS_REQUIRED");
    }

    assertConnected(requestedChannels, publication.available_channels);

    const assetIds = publication.assets.map((asset) => asset.id);
    const jobs = await Promise.all(requestedChannels.map((channel) =>
      PublishingRuntime.create({
        organization_id,
        creative_project_id,
        channel,
        provider_id: channel,
        status: "PENDING",
        payload: {
          contract: "CREATIVE_PUBLICATION_QUEUE_V1",
          channel,
          creative_asset_node_ids: assetIds,
        },
      }),
    ));

    return {
      success: true,
      channels: requestedChannels,
      available_channels: publication.available_channels,
      assets: assetIds,
      publish_job_ids: jobs.map((job) => job.id),
      total: publication.assets.length,
      status: "QUEUED",
    };
  },
};
