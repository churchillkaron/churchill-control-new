function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export const CREATIVE_CHANNEL_EXECUTION_BRIEF_CONTRACT =
  "CREATIVE_CHANNEL_EXECUTION_BRIEF_V1";

export function buildCreativeChannelExecutionBrief(input = {}) {
  const channel = text(input.channel);
  const capability = text(input.capability);
  if (!channel) throw new Error("channel required");
  if (!capability) throw new Error("capability required");

  return {
    contract: CREATIVE_CHANNEL_EXECUTION_BRIEF_CONTRACT,
    intent: text(input.intent) || "publish",
    channel,
    capability,
    provider_id: text(input.provider_id) || null,
    organization_id: text(input.organization_id) || null,
    entity_id: text(input.entity_id) || null,
    creative_project_id: text(input.creative_project_id) || null,
    campaign: object(input.campaign),
    audience: object(input.audience),
    budget: object(input.budget),
    schedule: object(input.schedule),
    placement: object(input.placement),
    call_to_action: object(input.call_to_action),
    tracking: object(input.tracking),
    content: object(input.content),
    channel_settings: object(input.channel_settings),
    business_asset: object(input.business_asset),
    creative_asset_node_ids: list(input.creative_asset_node_ids),
    evidence: object(input.evidence),
    conversation_context: object(input.conversation_context),
    requested_by: object(input.requested_by),
  };
}
