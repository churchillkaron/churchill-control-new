import { AsyncLocalStorage } from "node:async_hooks";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  CreativeUniversalTemporalDirectionRuntime,
} from "./CreativeUniversalTemporalDirectionRuntime";
import {
  WORLD_CLASS_CONCEPT_POLICY,
} from "./CreativeWorldClassConceptPolicy";
import {
  resolveWorldClassConceptPolicy,
} from "./CreativeWorldClassConceptPolicyResolver";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.autonomous-concept-regeneration.v1",
);
const EXECUTION_FLAG = Symbol.for(
  "avantiqo.creative.autonomous-concept-regeneration.capture.v1",
);
const ROUND_CONTEXT = new AsyncLocalStorage();

const RETRYABLE_FAILURES = [
  "CREATIVE_WORLD_CLASS_CONCEPT_",
  "CREATIVE_CONCEPT_COUNCIL_NO_QUALIFYING_CONCEPT",
  "CREATIVE_EXECUTIVE_CONCEPT_SELECTION_INVALID",
  "INDEPENDENT_CONCEPTS_SEMANTICALLY_TOO_SIMILAR",
  "INDEPENDENT_CONCEPT_TITLES_NOT_DISTINCT",
];

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedOutput(result = {}) {
  const value = result?.output?.output || result?.output || result || {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value.result || value;
  }
  const source = text(value).replace(/^\uFEFF/, "");
  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(source.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed.result || parsed;
      }
    } catch {
      // Continue conservatively.
    }
  }
  return null;
}

function operationOf(input = {}) {
  return text(input.metadata?.operation).toUpperCase();
}

function captureResult(input, result) {
  const state = ROUND_CONTEXT.getStore();
  if (!state) return;
  const operation = operationOf(input);
  const output = normalizedOutput(result);
  if (!output) return;

  if (operation.startsWith("CREATIVE_CONCEPT_DIRECTOR_CONCEPT-")) {
    const concept = object(output.concept || output);
    const id = text(concept.id).toLowerCase();
    if (id) state.current.concepts[id] = concept;
    return;
  }

  if (operation.startsWith("CREATIVE_CONCEPT_CRITIC_")) {
    const criticId = text(output.critic_id).toLowerCase() || operation
      .replace("CREATIVE_CONCEPT_CRITIC_", "")
      .replace(/_V\d+$/, "")
      .toLowerCase();
    state.current.critics[criticId] = output;
    return;
  }

  if (operation === "CREATIVE_EXECUTIVE_CONCEPT_SELECTION_V1") {
    state.current.selection = output;
  }
}

function scoreFailures(state) {
  const failures = [];
  for (const [criticId, report] of Object.entries(state.current.critics)) {
    const minimum = finite(state.policy.critic_minimums[criticId]);
    for (const evaluation of list(report.evaluations)) {
      const score = finite(evaluation.score);
      if (minimum !== null && (score === null || score < minimum)) {
        failures.push({
          concept_id: text(evaluation.concept_id),
          critic: criticId,
          score,
          required: minimum,
          failures: list(evaluation.failures).map(text).filter(Boolean),
          cliche_or_risk_hits: list(evaluation.cliche_or_risk_hits)
            .map(text)
            .filter(Boolean),
          mandatory_repairs: list(evaluation.mandatory_repairs)
            .map(text)
            .filter(Boolean),
          rejection_reason: text(evaluation.rejection_reason) || null,
        });
      }
    }
  }
  return failures;
}

function conceptSummary(concept = {}) {
  return {
    id: text(concept.id),
    title: text(concept.title),
    central_proposition: text(concept.central_proposition),
    original_world: text(concept.original_world),
    causal_story: text(concept.causal_story),
    signature_images: list(concept.signature_images).map(text).filter(Boolean),
    campaign_extensions: list(concept.campaign_extensions).map(text).filter(Boolean),
  };
}

function failureDiagnostic(state, error) {
  const concepts = Object.values(state.current.concepts).map(conceptSummary);
  const criticFailures = scoreFailures(state);
  const failedDimensions = [...new Set(criticFailures.map((item) => item.critic))];
  const cliches = [...new Set(
    criticFailures.flatMap((item) => item.cliche_or_risk_hits),
  )];
  const repairs = [...new Set(
    criticFailures.flatMap((item) => item.mandatory_repairs),
  )];
  const reasons = [...new Set(
    criticFailures
      .flatMap((item) => [...item.failures, item.rejection_reason])
      .filter(Boolean),
  )];

  return {
    contract: state.policy.regeneration.contract,
    failed_round: state.round,
    failure_code: text(error?.message || error),
    failed_dimensions: failedDimensions,
    critic_failures: criticFailures,
    repeated_cliches_or_risks: cliches,
    mandatory_changes: repairs,
    rejection_reasons: reasons,
    rejected_territories: concepts,
    next_round_directive: [
      "Create three materially different territories, not repairs or cosmetic rewrites of the rejected ideas.",
      "Do not reuse the prior central propositions, signature-image system, world-building mechanism or narrative engine.",
      "Attack the lowest critic dimensions first while preserving evidence, identity, rights and production feasibility.",
      "The new round must be more ownable, less swappable between clients, and causally stronger than the failed round.",
    ],
  };
}

function regenerationPrompt(state) {
  if (!state?.diagnostic || state.round <= 1) return "";
  return `\n\nAUTONOMOUS CONCEPT REGENERATION — ROUND ${state.round}\n${JSON.stringify(state.diagnostic)}\n\nNON-NEGOTIABLE REGENERATION RULES\n- Treat every rejected territory above as unavailable creative space.\n- Do not rename, polish, hybridize or lightly vary a rejected concept.\n- Change the governing mechanism, causal narrative engine, signature-image system and audience experience.\n- Preserve only evidence-backed brand, identity, product, music, rights and production constraints.\n- Solve the failed critic dimensions explicitly.\n- Return the normal strict JSON contract only.\n`;
}

function installExecutionCapture() {
  if (ServiceExecutionRuntime[EXECUTION_FLAG]) return;
  const execute = ServiceExecutionRuntime.execute.bind(ServiceExecutionRuntime);
  Object.defineProperty(ServiceExecutionRuntime, EXECUTION_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ServiceExecutionRuntime.execute = async function executeWithConceptRegeneration(input = {}) {
    const state = ROUND_CONTEXT.getStore();
    const operation = operationOf(input);
    const conceptOperation = Boolean(state) && (
      operation.startsWith("CREATIVE_CONCEPT_DIRECTOR_") ||
      operation.startsWith("CREATIVE_CONCEPT_CRITIC_") ||
      operation === "CREATIVE_EXECUTIVE_CONCEPT_SELECTION_V1"
    );
    const promptAddition = conceptOperation ? regenerationPrompt(state) : "";
    const result = await execute(
      promptAddition
        ? {
            ...input,
            input: {
              ...object(input.input),
              prompt: `${text(input.input?.prompt || input.prompt)}${promptAddition}`,
            },
            metadata: {
              ...object(input.metadata),
              autonomous_concept_regeneration_contract:
                state.policy.regeneration.contract,
              autonomous_concept_round: state.round,
            },
          }
        : input,
    );
    if (conceptOperation) captureResult(input, result);
    return result;
  };
}

function retryable(error) {
  const message = text(error?.message || error);
  return RETRYABLE_FAILURES.some((code) => message.includes(code));
}

function wordSet(value) {
  return new Set(
    text(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4),
  );
}

function similarity(left, right) {
  const a = wordSet(left);
  const b = wordSet(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((word) => b.has(word)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function conceptCorpus(concept = {}) {
  return [
    concept.title,
    concept.central_proposition,
    concept.original_world,
    concept.causal_story,
    ...list(concept.signature_images),
    ...list(concept.campaign_extensions),
  ].map(text).filter(Boolean).join(" ");
}

function selectedConcept(result = {}) {
  return object(
    result.independent_concept_council?.selection?.selected_concept ||
    result.plan?.concept_council?.selection?.selected_concept,
  );
}

function crossRoundSimilarity(state, result) {
  const selected = selectedConcept(result);
  if (!Object.keys(selected).length || !state.previous_concepts.length) return null;
  let maximum = 0;
  let closest = null;
  for (const prior of state.previous_concepts) {
    const score = similarity(conceptCorpus(selected), conceptCorpus(prior));
    if (score > maximum) {
      maximum = score;
      closest = prior;
    }
  }
  return {
    similarity: Number(maximum.toFixed(4)),
    closest_previous_concept_id: text(closest?.id) || null,
    closest_previous_title: text(closest?.title) || null,
  };
}

function enrichInput(input, state) {
  return {
    ...input,
    creative_intelligence_policy: state.policy,
    project: {
      ...object(input.project),
      metadata: {
        ...object(input.project?.metadata),
        creative_intelligence_policy: state.policy,
      },
    },
    brief: {
      ...object(input.brief),
      metadata: {
        ...object(input.brief?.metadata),
        creative_intelligence_policy: state.policy,
        ...(state?.diagnostic
          ? { autonomous_concept_regeneration: state.diagnostic }
          : {}),
      },
    },
  };
}

function finalizeResult(result, state) {
  const regeneration = state.policy.regeneration;
  const history = state.attempts.slice(
    -regeneration.persisted_failure_history_limit,
  );
  const evidence = {
    contract: regeneration.contract,
    passed: true,
    rounds_used: state.round,
    max_rounds: regeneration.max_rounds,
    regenerated: state.round > 1,
    prior_failed_rounds: history,
    stopped_on_a_grade: true,
    fail_closed_when_exhausted: true,
    maximum_cross_round_similarity:
      regeneration.maximum_cross_round_similarity,
    provider_execution: regeneration.provider_execution,
    policy_resolution: state.policy.policy_resolution,
  };
  return {
    ...result,
    plan: {
      ...object(result.plan),
      creative_intelligence_policy: state.policy,
      autonomous_concept_regeneration: evidence,
      validation_summary: {
        ...object(result.plan?.validation_summary),
        autonomous_concept_regeneration: evidence,
      },
    },
    autonomous_concept_regeneration: evidence,
  };
}

function newState(policy) {
  return {
    policy,
    round: 1,
    attempts: [],
    current: {
      concepts: {},
      critics: {},
      selection: null,
    },
    previous_concepts: [],
    diagnostic: null,
  };
}

function install() {
  if (CreativeUniversalTemporalDirectionRuntime[INSTALL_FLAG]) return;
  installExecutionCapture();
  const create = CreativeUniversalTemporalDirectionRuntime.create.bind(
    CreativeUniversalTemporalDirectionRuntime,
  );
  Object.defineProperty(CreativeUniversalTemporalDirectionRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeUniversalTemporalDirectionRuntime.create = async function createWithAutonomousConceptRegeneration(input = {}) {
    const projectId = text(input.project?.id || input.creative_project_id || input.project_id);
    if (!projectId) return create(input);
    const policy = resolveWorldClassConceptPolicy(input);
    const maxRounds = policy.regeneration.max_rounds;
    const state = newState(policy);

    return ROUND_CONTEXT.run(state, async () => {
      while (state.round <= maxRounds) {
        state.current = { concepts: {}, critics: {}, selection: null };
        try {
          const result = await create(enrichInput(input, state));
          const separation = crossRoundSimilarity(state, result);
          if (
            separation &&
            separation.similarity >
              policy.regeneration.maximum_cross_round_similarity
          ) {
            const error = new Error(
              `CREATIVE_WORLD_CLASS_CONCEPT_CROSS_ROUND_SIMILARITY_FAILED:${separation.similarity}`,
            );
            error.separation = separation;
            throw error;
          }
          return finalizeResult(result, state);
        } catch (error) {
          if (!retryable(error) || state.round >= maxRounds) {
            if (retryable(error) && state.round >= maxRounds) {
              const exhausted = new Error(
                `CREATIVE_AUTONOMOUS_CONCEPT_REGENERATION_EXHAUSTED:${state.round}:${text(error?.message || error)}`,
              );
              exhausted.cause = error;
              exhausted.attempts = state.attempts;
              throw exhausted;
            }
            throw error;
          }

          const diagnostic = failureDiagnostic(state, error);
          const failedConcepts = Object.values(state.current.concepts);
          state.previous_concepts.push(...failedConcepts);
          state.attempts.push({
            round: state.round,
            diagnostic,
            concept_count: failedConcepts.length,
          });
          state.diagnostic = diagnostic;
          state.round += 1;
        }
      }
      throw new Error("CREATIVE_AUTONOMOUS_CONCEPT_REGENERATION_EXHAUSTED");
    });
  };
}

install();

export const CreativeAutonomousConceptRegenerationRuntime = Object.freeze({
  installed: true,
  contract: WORLD_CLASS_CONCEPT_POLICY.regeneration.contract,
});
