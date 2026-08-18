import {
  runAIService,
} from "@/lib/platform/service-runtime/ai";
import {
  withPricingExecutionContext,
} from "@/lib/platform/service-runtime/pricing/PricingExecutionContextRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.resolution-pricing-context.v2",
);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function resolutionDimension(input = {}) {
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

  return text(
    providerParameters.resolution ||
    outputSpec.provider_resolution ||
    outputSpec.resolution ||
    shotOutput.provider_resolution ||
    shotOutput.resolution,
  ).toLowerCase() || null;
}

if (!runAIService[INSTALL_FLAG]) {
  const executeWithoutResolutionPricingContext = runAIService.execute.bind(runAIService);

  Object.defineProperty(runAIService, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  runAIService.execute = async function executeWithResolutionPricingContext(input = {}) {
    const resolution = resolutionDimension(input);
    if (!resolution) {
      return executeWithoutResolutionPricingContext(input);
    }

    return withPricingExecutionContext(
      {
        pricing_usage: {
          resolution,
          pricing_dimensions: { resolution },
        },
      },
      () => executeWithoutResolutionPricingContext(input),
    );
  };
}

export const CreativeVideoPricingContextRuntime = Object.freeze({
  installed: true,
  contract: "CREATIVE_RESOLUTION_PRICING_CONTEXT_V2",
  videoResolution: resolutionDimension,
  resolutionDimension,
});
