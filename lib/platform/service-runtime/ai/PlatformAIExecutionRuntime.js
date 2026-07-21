import {
  ServiceExecutionRuntime,
} from "../execution/ServiceExecutionRuntime";

function assertCanonicalCreativeVideoExecution(input = {}) {
  const serviceId = input.service_id;
  const metadata = input.metadata || {};
  const payload = input.input || {};

  if (serviceId !== "ai.video.generate") return;

  const isLegacyCampaignRequest =
    metadata.source === "marketing_campaign" ||
    metadata.module === "MARKETING_CAMPAIGN";
  const isAtomicCreativeTask = Boolean(
    payload.production_task_id ||
    metadata.task?.id ||
    metadata.production_contract ===
      "atomic_reference_grounded_shots_v1",
  );

  if (isLegacyCampaignRequest && !isAtomicCreativeTask) {
    throw new Error(
      "LEGACY_CAMPAIGN_VIDEO_DISABLED_USE_CREATIVE_DIRECTOR",
    );
  }
}

export const runAIService = {
  async execute(input = {}) {
    assertCanonicalCreativeVideoExecution(input);

    return ServiceExecutionRuntime.execute({
      ...input,
      category: "AI",
    });
  },
};
