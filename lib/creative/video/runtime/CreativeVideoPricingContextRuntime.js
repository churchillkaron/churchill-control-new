import {
  runAIService,
} from "@/lib/platform/service-runtime/ai";
import {
  withPricingExecutionContext,
} from "@/lib/platform/service-runtime/pricing/PricingExecutionContextRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.video-pricing-context.v1",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizedResolution(value) {
  const normalized = text(value).toLowerCase();
  if (["4k", "2160p", "3840x2160", "2160x3840"].includes(normalized)) {
    return "4k";
  }
  if (["1080p", "1920x1080", "1080x1920"].includes(normalized)) {
    return "1080p";
  }
  if (["720p", "1280x720", "720x1280"].includes(normalized)) {
    return "720p";
  }
  return normalized || null;
}

function videoResolution(input = {}) {
  const payload = object(input.input);
  const generation = object(payload.generation);
  const providerParameters = {
    ...object(generation.provider_parameters),
    ...object(payload.provider_parameters),
  };
  const outputSpec = object(
    payload.output_spec ||
    generation.output_spec,
  );
  const shotBible = object(payload.shot_bible || payload.shotBible);
  const shotOutput = object(shotBible.output);

  return normalizedResolution(
    providerParameters.resolution ||
    outputSpec.provider_resolution ||
    outputSpec.resolution ||
    shotOutput.provider_resolution ||
    shotOutput.resolution,
  );
}

function videoCapability(input = {}) {
  const payload = object(input.input);
  return text(
    input.capability ||
    payload.capability ||
    payload.generation?.capability ||
    payload.generation?.service ||
    input.service_id,
  ).toLowerCase();
}

if (!runAIService[INSTALL_FLAG]) {
  const executeWithoutVideoPricingContext = runAIService.execute.bind(runAIService);

  Object.defineProperty(runAIService, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  runAIService.execute = async function executeWithVideoPricingContext(input = {}) {
    const capability = videoCapability(input);
    const resolution = capability.includes("video")
      ? videoResolution(input)
      : null;

    if (!resolution) {
      return executeWithoutVideoPricingContext(input);
    }

    return withPricingExecutionContext(
      {
        pricing_usage: {
          resolution,
          pricing_dimensions: { resolution },
        },
      },
      () => executeWithoutVideoPricingContext(input),
    );
  };
}

export const CreativeVideoPricingContextRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_VIDEO_PRICING_CONTEXT_V1",
  videoResolution,
});
