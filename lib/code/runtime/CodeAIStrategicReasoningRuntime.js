import {
  executeBatchedAutonomousCodeMissionWithDeterministicConvergence,
} from "./CodeAIWorkPackageDeterministicConvergenceRuntime.js";
import {
  runCodeAIStrategicExternalResearch,
  formatCodeAIStrategicExternalResearchForObjective,
  resolveCodeAIStrategicExternalResearchNeed,
  CODE_AI_STRATEGIC_EXTERNAL_RESEARCH_CONTRACT,
} from "./CodeAIStrategicExternalResearchRuntime.js";
import {
  deriveCodeAIRepositoryImpact,
  formatCodeAIRepositoryImpactForObjective,
  CODE_AI_REPOSITORY_IMPACT_CONTRACT,
} from "./CodeAIRepositoryImpactRuntime.js";

export const CODE_AI_STRATEGIC_REASONING_CONTRACT =
  "AVANTIQO_CODE_AI_STRATEGIC_REASONING_V1";

const STRATEGIC_PROTOCOL_MARKER = "AVANTIQO_STRATEGIC_ENGINEERING_PROTOCOL_V1";

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function implementationPresent(state = {}) {
  const source = object(state);
  return (
    list(source.source_changes).length > 0 ||
    list(source.files_changed).length > 0 ||
    Boolean(text(source.patch, 1))
  );
}

function strictExternalResearchRequired(need = {}) {
  const source = object(need);
  return source.explicit_research_signal === true || source.volatility_signal === true;
}

function unavailableResearch(need, error) {
  return {
    contract: CODE_AI_STRATEGIC_EXTERNAL_RESEARCH_CONTRACT,
    status: "RESEARCH_UNAVAILABLE",
    required: need?.required === true,
    strict_required: strictExternalResearchRequired(need),
    need,
    query: null,
    answer: null,
    claims: [],
    sources: [],
    source_count: 0,
    research_call_performed: false,
    failure_reason: text(error?.message || error, 800) || "CODE_AI_STRATEGIC_EXTERNAL_RESEARCH_FAILED",
    external_evidence_is_context_only: true,
    current_repository_remains_execution_authority: true,
    authorization_effect: "NONE",
    execution_effect: "NONE",
    raw_reasoning_persisted: false,
  };
}

async function resolveStrategicResearch({ context, objective, resumeState }) {
  const need = resolveCodeAIStrategicExternalResearchNeed(objective);
  if (!need.required) {
    return runCodeAIStrategicExternalResearch({
      context,
      objective,
      existing: resumeState?.strategic_external_research || null,
    });
  }
  try {
    const research = await runCodeAIStrategicExternalResearch({
      context,
      objective,
      existing: resumeState?.strategic_external_research || null,
    });
    return {
      ...object(research),
      strict_required: strictExternalResearchRequired(need),
    };
  } catch (error) {
    return unavailableResearch(need, error);
  }
}

export function buildCodeAIStrategicObjective({
  objective,
  resume_state = null,
  external_research = null,
  repository_impact = null,
} = {}) {
  const goal = text(objective, 9000);
  if (!goal) throw new Error("CODE_AI_STRATEGIC_OBJECTIVE_REQUIRED");
  if (goal.includes(STRATEGIC_PROTOCOL_MARKER)) return goal;

  const existingImplementation = implementationPresent(resume_state);
  const protocol = existingImplementation
    ? [
        STRATEGIC_PROTOCOL_MARKER,
        "STRATEGIC ENGINEERING MODE: an implementation already exists. Use the loaded repository evidence and controller failure/verification evidence to repair the root cause, not merely the visible symptom.",
        "Do not weaken tests, types, lint, security, CI, validation, or product completion criteria to obtain a green result.",
        "When more than one correction is viable, choose the option with the best combination of correctness, smallest justified blast radius, compatibility, maintainability, performance, and verification strength.",
        "Do not reopen satisfied discovery when the controller has locked discovery. Do not add abstraction or novelty without repository evidence that it reduces duplication, risk, or complexity.",
      ].join("\n")
    : [
        STRATEGIC_PROTOCOL_MARKER,
        "STRATEGIC ENGINEERING MODE: do not default to the first plausible patch. Use the already-loaded Fast Start repository evidence as a map and compare viable implementation shapes before mutation whenever the repository shows a meaningful choice.",
        "Evaluate four lenses before choosing the edit: (1) the direct target/root cause, (2) callers/consumers and compatibility boundaries, (3) analogous implementations or reusable mechanisms elsewhere in the repository, and (4) tests, contracts and verification surfaces.",
        "Prefer an existing reusable architecture over a duplicate mechanism. Prefer a root-cause fix over a symptom patch. Prefer a bounded local fix when centralization or abstraction would increase blast radius without a demonstrated benefit.",
        "For architecture, performance, concurrency, reliability, or scaling work, consider whether a data-flow, state-machine, algorithmic, caching, batching, concurrency, lifecycle, or ownership change is materially better than a line-level patch. Do not be novel merely to be different.",
        "Use cross-repository search evidence to look outside the obvious folder. A nearby implementation is not automatically the best precedent; compare semantics and constraints before reuse.",
        "Keep the work package batched. Spend model calls on engineering judgment, not repeated navigation that deterministic repository search can provide.",
        "In the work-package summary, state the selected implementation direction and one materially different alternative that was rejected, with concise evidence-based reasons. This is a decision record, not private chain-of-thought.",
      ].join("\n");
  const impactContext = formatCodeAIRepositoryImpactForObjective(repository_impact);
  const researchContext = formatCodeAIStrategicExternalResearchForObjective(external_research);

  return [goal, protocol, impactContext, researchContext].filter(Boolean).join("\n\n");
}

function strategicMetadata({ result, resumeState, externalResearch, repositoryImpact }) {
  const summary = text(result?.summary, 4000).toLowerCase();
  return {
    contract: CODE_AI_STRATEGIC_REASONING_CONTRACT,
    protocol: STRATEGIC_PROTOCOL_MARKER,
    protocol_applied: true,
    phase: implementationPresent(resumeState) ? "REPAIR_OR_CLOSURE" : "DISCOVERY_OR_IMPLEMENTATION",
    compare_implementation_alternatives: true,
    root_cause_over_symptom: true,
    cross_repository_analogue_search_expected: true,
    callers_and_contracts_considered: true,
    verification_surface_considered: true,
    novelty_without_evidence_forbidden: true,
    repository_impact_contract: CODE_AI_REPOSITORY_IMPACT_CONTRACT,
    repository_impact_risk: text(repositoryImpact?.risk, 80) || "unknown",
    repository_impact_path_count: Number(repositoryImpact?.observed_path_count || 0),
    repository_cross_surface_impact: repositoryImpact?.cross_surface_impact === true,
    repository_impact_model_call_performed: false,
    governed_external_research_contract: CODE_AI_STRATEGIC_EXTERNAL_RESEARCH_CONTRACT,
    governed_external_research_required: externalResearch?.required === true,
    governed_external_research_status: text(externalResearch?.status, 160) || null,
    governed_external_research_source_count: Number(externalResearch?.source_count || 0),
    external_research_authorization_effect: "NONE",
    extra_reasoning_calls_required_by_protocol: 0,
    decision_record_observed:
      summary.includes("alternative") ||
      summary.includes("strategy") ||
      summary.includes("approach"),
    raw_reasoning_persisted: false,
    authorization_effect: "NONE",
  };
}

function researchBlockedResult({ originalObjective, resumeState, research, repositoryImpact }) {
  const state = {
    ...object(resumeState),
    objective: originalObjective,
    status: "blocked",
    blockers: [
      `CODE_AI_STRATEGIC_EXTERNAL_RESEARCH_REQUIRED_UNAVAILABLE:${text(research?.failure_reason, 500) || "UNKNOWN"}`,
    ],
    repository_impact: repositoryImpact,
    strategic_external_research: research,
    updated_at: new Date().toISOString(),
  };
  const strategic = strategicMetadata({
    result: { summary: null },
    resumeState,
    externalResearch: research,
    repositoryImpact,
  });
  state.strategic_reasoning = strategic;
  return {
    success: false,
    status: "blocked",
    reason: state.blockers[0],
    state,
    strategic_reasoning: strategic,
    repository_impact: repositoryImpact,
    strategic_external_research: research,
    reasoning_calls: Number(state?.work_package_control?.reasoning_calls_used || 0),
  };
}

export async function executeCodeAIStrategicBatchedMission(input = {}) {
  const originalObjective = text(input.objective, 9000);
  const repositoryImpact = deriveCodeAIRepositoryImpact(input.resume_state || {});
  const research = await resolveStrategicResearch({
    context: input.context,
    objective: originalObjective,
    resumeState: input.resume_state,
  });

  if (
    research?.required === true &&
    research?.strict_required === true &&
    text(research?.status, 160) === "RESEARCH_UNAVAILABLE"
  ) {
    return researchBlockedResult({
      originalObjective,
      resumeState: input.resume_state,
      research,
      repositoryImpact,
    });
  }

  const strategicObjective = buildCodeAIStrategicObjective({
    objective: originalObjective,
    resume_state: input.resume_state,
    external_research: research,
    repository_impact: repositoryImpact,
  });
  const result = await executeBatchedAutonomousCodeMissionWithDeterministicConvergence({
    ...input,
    objective: strategicObjective,
  });
  const strategic = strategicMetadata({
    result,
    resumeState: input.resume_state,
    externalResearch: research,
    repositoryImpact,
  });

  return {
    ...object(result),
    state: result?.state
      ? {
          ...object(result.state),
          objective: originalObjective || text(result.state.objective, 9000),
          strategic_reasoning: strategic,
          repository_impact: repositoryImpact,
          strategic_external_research: research,
        }
      : result?.state,
    strategic_reasoning: strategic,
    repository_impact: repositoryImpact,
    strategic_external_research: research,
  };
}

export const CodeAIStrategicReasoningRuntime = Object.freeze({
  contract: CODE_AI_STRATEGIC_REASONING_CONTRACT,
  repository_impact_contract: CODE_AI_REPOSITORY_IMPACT_CONTRACT,
  external_research_contract: CODE_AI_STRATEGIC_EXTERNAL_RESEARCH_CONTRACT,
  protocol: STRATEGIC_PROTOCOL_MARKER,
  buildObjective: buildCodeAIStrategicObjective,
  execute: executeCodeAIStrategicBatchedMission,
});

export default CodeAIStrategicReasoningRuntime;