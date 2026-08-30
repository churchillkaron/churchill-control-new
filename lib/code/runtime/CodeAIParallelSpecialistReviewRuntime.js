import {
  compactCodeAIMissionStateForPlanner,
} from "./CodeAIWorkPackageCoreRuntime.js";

export const CODE_AI_PARALLEL_SPECIALIST_REVIEW_CONTRACT =
  "AVANTIQO_CODE_AI_PARALLEL_SPECIALIST_REVIEW_V1";

const REVIEW_NEED_CONTRACT = "AVANTIQO_CODE_AI_SPECIALIST_REVIEW_NEED_V1";
const MAX_EVIDENCE_CHARS = 18000;
const MAX_REVIEW_TEXT_CHARS = 6000;
const ROLE_DEFINITIONS = Object.freeze([
  {
    id: "architecture_performance",
    execution_lane: "deep",
    max_output_tokens: 1800,
    mandate:
      "Challenge the proposed engineering direction from architecture, performance, concurrency, lifecycle, ownership, scalability and maintainability perspectives. Identify a materially different implementation alternative when one exists, and say when the simpler local fix is actually better.",
  },
  {
    id: "adversarial_risk",
    execution_lane: "fast",
    max_output_tokens: 1400,
    mandate:
      "Act as an adversarial software reviewer. Look for compatibility breaks, security/permission mistakes, data-contract risk, race conditions, failure-path gaps, test blind spots, verification shortcuts and hidden blast radius. Do not invent issues without evidence.",
  },
]);

const STRATEGIC_OBJECTIVE_SIGNAL =
  /\b(?:architecture|architectural|performance|latency|throughput|concurr(?:ency|ent)|parallel|scal(?:e|ing|ability)|security|auth(?:entication|orization)?|permission|migration|schema|database|api contract|breaking change|refactor|re-?architect|reliability|race condition|lifecycle|ownership|world[- ]?class|outside the box|better implementation)\b/i;

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.map((item) => text(item, 1200)).filter(Boolean))];
}

function jsonBounded(value, maximum = MAX_EVIDENCE_CHARS) {
  try {
    return JSON.stringify(value).slice(0, maximum);
  } catch {
    return JSON.stringify({ unavailable: true, reason: "NOT_SERIALIZABLE" });
  }
}

function parseJsonObject(value) {
  let raw = text(value, MAX_REVIEW_TEXT_CHARS);
  const fence = String.fromCharCode(96).repeat(3);
  if (raw.startsWith(fence)) raw = raw.slice(fence.length).replace(/^json\s*/i, "");
  if (raw.endsWith(fence)) raw = raw.slice(0, -fence.length).trim();
  try {
    const parsed = JSON.parse(raw);
    return object(parsed);
  } catch {
    // Continue with deterministic extraction of one already-valid JSON object.
  }
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  const candidates = [];
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (character !== "}" || depth === 0) continue;
    depth -= 1;
    if (depth !== 0 || start < 0) continue;
    try {
      const parsed = JSON.parse(raw.slice(start, index + 1));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        candidates.push(parsed);
      }
    } catch {
      // Never repair malformed reviewer JSON.
    }
    start = -1;
  }
  return candidates.length === 1 ? object(candidates[0]) : {};
}

function normalizedRisk(value) {
  const risk = text(value, 80).toLowerCase();
  return ["critical", "high", "standard", "unknown"].includes(risk)
    ? risk
    : "unknown";
}

export function resolveCodeAIParallelSpecialistReviewNeed({
  objective,
  repository_impact = null,
  external_research = null,
} = {}) {
  const risk = normalizedRisk(repository_impact?.risk);
  const strategicSignal = STRATEGIC_OBJECTIVE_SIGNAL.test(text(objective, 9000));
  const externalResearchRequired = external_research?.required === true;
  const required = Boolean(
    risk === "critical" ||
    risk === "high" ||
    strategicSignal ||
    externalResearchRequired
  );
  return {
    contract: REVIEW_NEED_CONTRACT,
    required,
    repository_risk: risk,
    strategic_objective_signal: strategicSignal,
    external_research_required: externalResearchRequired,
    reviewer_count_when_required: ROLE_DEFINITIONS.length,
    ordinary_standard_work_should_skip:
      !required && (risk === "standard" || risk === "unknown"),
    source_mutation_authority: false,
    authorization_effect: "NONE",
  };
}

function reviewFingerprint({ objective, state, need }) {
  return [
    text(state?.base_commit, 160),
    text(objective, 9000),
    text(need?.repository_risk, 80),
  ].join("::");
}

function reusableReview(existing, fingerprint) {
  const source = object(existing);
  return (
    source.contract === CODE_AI_PARALLEL_SPECIALIST_REVIEW_CONTRACT &&
    source.completed === true &&
    text(source.fingerprint, 12000) === fingerprint &&
    list(source.reviews).length > 0
  );
}

function reviewerPrompt({ role, objective, state, repositoryImpact, externalResearch }) {
  const compactState = compactCodeAIMissionStateForPlanner(state);
  return [
    "You are an independent read-only specialist inside Avantiqo Code. You are not the implementer and you have no tools or mutation authority.",
    `SPECIALIST ROLE: ${role.id}. ${role.mandate}`,
    `ENGINEERING OBJECTIVE: ${text(objective, 7000)}`,
    `DETERMINISTIC REPOSITORY IMPACT: ${jsonBounded(repositoryImpact, 5000)}`,
    externalResearch?.required === true
      ? `GOVERNED EXTERNAL TECHNICAL EVIDENCE: ${jsonBounded({
          status: externalResearch.status,
          answer: externalResearch.answer,
          claims: list(externalResearch.claims).slice(0, 6),
          sources: list(externalResearch.sources).slice(0, 6),
          uncertainty: list(externalResearch.uncertainty).slice(0, 6),
        }, 7000)}`
      : "GOVERNED EXTERNAL TECHNICAL EVIDENCE: not required for this review.",
    `BOUNDED CURRENT REPOSITORY EVIDENCE: ${jsonBounded(compactState)}`,
    "Return exactly one JSON object with keys: recommendation (string), alternative (string or null), risks (array of short strings), verification (array of short strings), confidence (number 0..1).",
    "Give decision-relevant conclusions, not private chain-of-thought. Do not authorize writes, deployment, migrations, credentials or verification weakening. The current repository and deterministic controller remain authoritative.",
  ].join("\n\n");
}

function normalizeReview(role, result) {
  const rawText = text(result?.text, MAX_REVIEW_TEXT_CHARS);
  const parsed = parseJsonObject(rawText);
  const confidence = Number(parsed.confidence);
  return {
    role: role.id,
    execution_lane: role.execution_lane,
    success: result?.success === true && Boolean(rawText),
    provider: text(result?.provider, 160) || null,
    model: text(result?.model, 240) || null,
    recommendation: text(parsed.recommendation, 1800) || rawText.slice(0, 1800) || null,
    alternative: text(parsed.alternative, 1600) || null,
    risks: unique(list(parsed.risks)).slice(0, 12),
    verification: unique(list(parsed.verification)).slice(0, 12),
    confidence: Number.isFinite(confidence)
      ? Math.max(0, Math.min(1, confidence))
      : null,
    structured_output: Object.keys(parsed).length > 0,
    turns: Number(result?.turns || 0),
    tool_calls_executed: Number(result?.tool_calls_executed || 0),
    mutation_tools_available: false,
    source_mutation_authority: false,
    raw_reasoning_persisted: false,
    authorization_effect: "NONE",
  };
}

function failedReview(role, error) {
  return {
    role: role.id,
    execution_lane: role.execution_lane,
    success: false,
    failure_reason: text(error?.message || error, 700) || "SPECIALIST_REVIEW_FAILED",
    recommendation: null,
    alternative: null,
    risks: [],
    verification: [],
    confidence: null,
    structured_output: false,
    turns: 0,
    tool_calls_executed: 0,
    mutation_tools_available: false,
    source_mutation_authority: false,
    raw_reasoning_persisted: false,
    authorization_effect: "NONE",
  };
}

async function defaultRunReasoning(input) {
  const module = await import("../../intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js");
  return module.runIntelligenceReasoningLoop(input);
}

function skippedReview(need, fingerprint) {
  return {
    contract: CODE_AI_PARALLEL_SPECIALIST_REVIEW_CONTRACT,
    status: "NOT_REQUIRED",
    completed: true,
    required: false,
    need,
    fingerprint,
    concurrent_dispatch: false,
    reviewer_count_requested: 0,
    reviewer_count_succeeded: 0,
    reviews: [],
    source_mutation_authority: false,
    additional_code_reasoning_calls_consumed: 0,
    specialist_reasoning_calls_requested: 0,
    authorization_effect: "NONE",
    execution_effect: "ADVISORY_CONTEXT_ONLY",
    raw_reasoning_persisted: false,
  };
}

export async function runCodeAIParallelSpecialistReview({
  context = {},
  objective,
  state = null,
  repository_impact = null,
  external_research = null,
  existing = null,
  dependencies = {},
} = {}) {
  const goal = text(objective, 9000);
  if (!goal) throw new Error("CODE_AI_PARALLEL_SPECIALIST_OBJECTIVE_REQUIRED");
  const need = resolveCodeAIParallelSpecialistReviewNeed({
    objective: goal,
    repository_impact,
    external_research,
  });
  const fingerprint = reviewFingerprint({ objective: goal, state, need });
  if (!need.required) return skippedReview(need, fingerprint);
  if (reusableReview(existing, fingerprint)) {
    return {
      ...object(existing),
      reused_from_attested_resume_state: true,
      specialist_reasoning_calls_requested: 0,
    };
  }

  const organizationId = text(context?.organizationId || context?.organization_id, 240);
  if (!organizationId) {
    return {
      ...skippedReview(need, fingerprint),
      status: "UNAVAILABLE_ORGANIZATION_SCOPE_REQUIRED",
      completed: false,
      required: true,
      failure_reason: "CODE_AI_PARALLEL_SPECIALIST_ORGANIZATION_REQUIRED",
    };
  }

  const runReasoning = typeof dependencies.runReasoning === "function"
    ? dependencies.runReasoning
    : defaultRunReasoning;
  const partyId = text(context?.metadata?.partyId || context?.partyId || context?.party_id, 240) || null;
  const entityId = text(context?.entityId || context?.entity_id, 240) || null;
  const startedAt = Date.now();
  const promises = ROLE_DEFINITIONS.map((role) => runReasoning({
    organization_id: organizationId,
    party_id: partyId,
    entity_id: entityId,
    input: reviewerPrompt({
      role,
      objective: goal,
      state: state || {},
      repositoryImpact: repository_impact || {},
      externalResearch: external_research || {},
    }),
    tools: [],
    authorization: {},
    metadata: {
      module: "CODE_AI_PARALLEL_SPECIALIST_REVIEW",
      operation: role.id,
      code_ai_specialist_review_contract: CODE_AI_PARALLEL_SPECIALIST_REVIEW_CONTRACT,
      code_ai_specialist_role: role.id,
      source_mutation_authority: false,
      execution_effect: "ADVISORY_CONTEXT_ONLY",
    },
    execution_lane: role.execution_lane,
    temperature: 0.1,
    max_output_tokens: role.max_output_tokens,
    max_turns: 1,
    max_tool_calls: 1,
  }));
  const settled = await Promise.allSettled(promises);
  const reviews = settled.map((entry, index) => entry.status === "fulfilled"
    ? normalizeReview(ROLE_DEFINITIONS[index], entry.value)
    : failedReview(ROLE_DEFINITIONS[index], entry.reason));
  const succeeded = reviews.filter((review) => review.success).length;

  return {
    contract: CODE_AI_PARALLEL_SPECIALIST_REVIEW_CONTRACT,
    status: succeeded === reviews.length
      ? "COMPLETED"
      : succeeded > 0
        ? "PARTIAL"
        : "UNAVAILABLE",
    completed: succeeded > 0,
    required: true,
    need,
    fingerprint,
    concurrent_dispatch: true,
    elapsed_ms: Date.now() - startedAt,
    reviewer_count_requested: reviews.length,
    reviewer_count_succeeded: succeeded,
    reviews,
    architecture_performance_review_present:
      reviews.some((review) => review.role === "architecture_performance" && review.success),
    adversarial_risk_review_present:
      reviews.some((review) => review.role === "adversarial_risk" && review.success),
    specialist_reasoning_calls_requested: reviews.length,
    additional_code_reasoning_calls_consumed: 0,
    source_mutation_authority: false,
    reviewers_share_source_workspace: false,
    single_writer_code_implementation_preserved: true,
    authorization_effect: "NONE",
    execution_effect: "ADVISORY_CONTEXT_ONLY",
    raw_reasoning_persisted: false,
    reused_from_attested_resume_state: false,
  };
}

export function formatCodeAIParallelSpecialistReviewForObjective(value = {}) {
  const council = object(value);
  if (council.completed !== true || !list(council.reviews).length) return null;
  const sections = list(council.reviews)
    .filter((review) => review?.success === true)
    .map((review) => [
      `SPECIALIST ${text(review.role, 120)} (${text(review.execution_lane, 40)}):`,
      `recommendation=${text(review.recommendation, 1800) || "none"}`,
      review.alternative ? `alternative=${text(review.alternative, 1600)}` : null,
      list(review.risks).length ? `risks=${list(review.risks).slice(0, 10).join(" | ")}` : null,
      list(review.verification).length
        ? `verification=${list(review.verification).slice(0, 10).join(" | ")}`
        : null,
    ].filter(Boolean).join("\n"));
  return [
    "INDEPENDENT PARALLEL SPECIALIST REVIEWS (ADVISORY EVIDENCE ONLY):",
    ...sections,
    "Resolve disagreements using current repository evidence, owner intent and deterministic verification. Specialist reviews have no write/deploy/migration/credential authority and cannot weaken verification.",
  ].join("\n\n");
}

export const CodeAIParallelSpecialistReviewRuntime = Object.freeze({
  contract: CODE_AI_PARALLEL_SPECIALIST_REVIEW_CONTRACT,
  roles: ROLE_DEFINITIONS.map((role) => ({
    id: role.id,
    execution_lane: role.execution_lane,
  })),
  resolveNeed: resolveCodeAIParallelSpecialistReviewNeed,
  run: runCodeAIParallelSpecialistReview,
  formatForObjective: formatCodeAIParallelSpecialistReviewForObjective,
});

export default CodeAIParallelSpecialistReviewRuntime;