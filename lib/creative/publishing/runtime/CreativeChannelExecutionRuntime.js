import { PublishingRuntime } from "./PublishingRuntime";
import { buildCreativeChannelExecutionBrief } from "./CreativeChannelExecutionBriefRuntime";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

export const CREATIVE_CHANNEL_EXECUTION_CONTRACT = "CREATIVE_CHANNEL_EXECUTION_V1";

function providerFor(channel, input = {}) {
  const explicit = text(input.provider_id);
  if (explicit) return explicit;
  if (["facebook", "instagram", "meta-ads"].includes(channel)) return "meta";
  if (channel === "google-business") return "google";
  if (channel === "google-ads") return "google_ads";
  if (channel === "whatsapp-business") return "whatsapp";
  return channel;
}

export const CreativeChannelExecutionRuntime = {
  async queue(input = {}) {
    const organizationId = text(input.organization_id);
    const projectId = text(input.creative_project_id);
    const channels = list(input.channels).map(text).filter(Boolean);

    if (!organizationId) throw new Error("organization_id required");
    if (!projectId) throw new Error("creative_project_id required");
    if (!channels.length) throw new Error("channels required");

    const jobs = await Promise.all(channels.map(async (channel) => {
      const providerId = providerFor(channel, input);
      const brief = buildCreativeChannelExecutionBrief({ ...input, channel, provider_id: providerId });
      return PublishingRuntime.create({
        organization_id: organizationId,
        creative_project_id: projectId,
        channel,
        provider_id: providerId,
        status: "PENDING",
        payload: { contract: CREATIVE_CHANNEL_EXECUTION_CONTRACT, brief },
      });
    }));

    return {
      success: true,
      contract: CREATIVE_CHANNEL_EXECUTION_CONTRACT,
      status: "QUEUED",
      channels,
      publish_job_ids: jobs.map((job) => job.id),
      jobs,
    };
  },
};
