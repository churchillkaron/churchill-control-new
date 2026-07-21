import {
  ServiceExecutionRuntime,
} from "../execution/ServiceExecutionRuntime";

import {
  CreativeVideoQualityRuntime,
} from "@/lib/creative/quality/runtime/CreativeVideoQualityRuntime";

function firstValue(...values) {
  return values.find(
    (value) => value !== undefined && value !== null,
  ) ?? null;
}

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

function videoSource(payload = {}) {
  const asset =
    payload.assets?.selectedAssets?.[0] ||
    payload.assets?.[0] ||
    null;

  return firstValue(
    payload.video_url,
    payload.source_video,
    asset?.video_url,
    asset?.file_url,
    asset?.url,
  );
}

async function executeLocalCreativeRuntime(input = {}) {
  const payload = input.input || {};
  const metadata = input.metadata || {};
  const task = metadata.task || {};

  if (payload.mode !== "creative_video_shot_qa") {
    return null;
  }

  const review = await CreativeVideoQualityRuntime.inspect({
    organization_id: input.organization_id,
    creative_project_id:
      task.creative_project_id ||
      metadata.creative_project_id,
    production_task_id:
      payload.production_task_id ||
      task.id,
    video_url: videoSource(payload),
    specification: payload.specification || {},
    minimum_score: payload.minimum_score || 90,
  });

  return {
    success: true,
    provider: "avantiqo-media-runtime",
    model: "creative-video-qa-v1",
    output: {
      result: review,
      json: review,
      contact_sheet_url: review.contact_sheet_url,
      inspected_video_url: review.inspected_video_url,
    },
  };
}

export const runAIService = {
  async execute(input = {}) {
    assertCanonicalCreativeVideoExecution(input);

    const localResult = await executeLocalCreativeRuntime(input);
    if (localResult) return localResult;

    return ServiceExecutionRuntime.execute({
      ...input,
      category: "AI",
    });
  },
};
