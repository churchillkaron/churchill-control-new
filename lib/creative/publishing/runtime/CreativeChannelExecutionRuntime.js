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
  async queue() {
    throw new Error("CREATIVE_LEGACY_PUBLISH_QUEUE_RETIRED_USE_RELEASE_AUTHORITY");
  },
};
