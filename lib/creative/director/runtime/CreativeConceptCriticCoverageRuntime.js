import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.concept-critic-coverage.v1",
);

const TARGET_OPERATION =
  "CREATIVE_CONCEPT_CRITIC_PRODUCTION_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function hardenedPrompt(prompt) {
  return `${text(prompt)}

STRICT PRODUCTION-CRITIC COVERAGE CONTRACT
- Return exactly three evaluations: one for concept-a, one for concept-b, and one for concept-c.
- Do not omit, merge, rename, summarize, or combine any concept.
- evaluations must be a JSON array with exactly three objects.
- Each evaluation must contain concept_id, score, passed, strengths, failures, cliche_or_risk_hits, mandatory_repairs, and rejection_reason.
- concept_id values must be exactly concept-a, concept-b, and concept-c, each appearing once.
- ranking must contain exactly concept-a, concept-b, and concept-c, each appearing once.
- Even a rejected or impossible concept still requires a complete evaluation object.
- Return strict JSON only with no prose before or after the object.
`;
}

export function installCreativeConceptCriticCoverageRuntime() {
  if (ServiceExecutionRuntime[INSTALL_FLAG]) return;

  const executeWithoutCoverage =
    ServiceExecutionRuntime.execute.bind(ServiceExecutionRuntime);

  Object.defineProperty(ServiceExecutionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute =
    async function executeWithCriticCoverage(input = {}) {
      const operation = text(input.metadata?.operation).toUpperCase();
      if (
        text(input.category).toUpperCase() !== "CREATIVE_DIRECTION" ||
        operation !== TARGET_OPERATION
      ) {
        return executeWithoutCoverage(input);
      }

      console.log(
        "CREATIVE_CONCEPT_CRITIC_COVERAGE_HARDENED=production",
      );

      return executeWithoutCoverage({
        ...input,
        input: {
          ...object(input.input),
          prompt: hardenedPrompt(
            input.input?.prompt || input.prompt,
          ),
        },
        metadata: {
          ...object(input.metadata),
          critic_coverage_contract:
            "EXACT_THREE_CONCEPT_EVALUATIONS_V1",
        },
      });
    };
}

installCreativeConceptCriticCoverageRuntime();

export const CreativeConceptCriticCoverageRuntime = Object.freeze({
  installed: true,
  operation: TARGET_OPERATION,
});
