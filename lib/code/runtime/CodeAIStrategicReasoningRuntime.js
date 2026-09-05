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
import {
  runCodeAIParallelSpecialistReview,
  formatCodeAIParallelSpecialistReviewForObjective,
  CODE_AI_PARALLEL_SPECIALIST_REVIEW_CONTRACT,
} from "./CodeAIParallelSpecialistReviewRuntime.js";
import {
  reconcileCodeAIEngineeringPlan,
  bindCodeAIEngineeringPlanToState,
  formatCodeAIEngineeringPlanForObjective,
  CODE_AI_ENGINEERING_PLAN_CONTRACT,
} from "./CodeAIEngineeringPlanRuntime.js";

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

function stateForPlanning(input = {}, objective = null) {
  const resume = object(input.resume_state);
  return {
    ...resume,
    objective: text(resume.objective || objective || input.objective, 9000),
    repository_url:
      text(resume.repository_url || input.repository_url, 1000) || null,
    ref: text(resume.ref || input.ref || "main", 160) || "main",
    objective_context: Object.keys(object(resume.objective_context)).length
      ? object(resume.objective_context)
      : object(input.objective_context),
    employee_mission: {
      ...object(resume.employee_mission),
      owner_intent:
        text(
          resume?.employee_mission?.owner_intent ||
          input.owner_intent ||
          objective ||
          input.objective,
          5000,
        ) || null,
    },
  };
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

async function resolveParallelSpecialistCouncil({
  context,
  objective,
  resumeState,
  repositoryImpact,
  externalResearch,
}) {
  try {
    return await runCodeAIParallelSpecialistReview({
      context,
      objective,
      state: resumeState || {},
      repository_impact: repositoryImpact,
      external_research: externalResearch,
      existing: resumeState?.parallel_specialist_review || null,
    });
  } catch (error) {
    return {
      contract: CODE_AI_PARALLEL_SPECIALIST_REVIEW_CONTRACT,
      status: "UNAVAILABLE",
      completed: false,
      required: false,
      failure_reason: text(error?.message || error, 800) || "CODE_AI_PARALLEL_SPECIALIST_REVIEW_FAILED",
      concurrent_dispatch: false,
      reviewer_count_requested: 0,
      reviewer_count_succeeded: 0,
      reviews: [],
      specialist_reasoning_calls_requested: 0,
      additional_code_reasoning_calls_consumed: 0,
      source_mutation_authority: false,
      single_writer_code_implementation_preserved: true,
      authorization_effect: "NONE",
      execution_effect: "ADVISORY_CONTEXT_ONLY",
      raw_reasoning_persisted: false,
    };
  }
}

export function buildCodeAIStrategicObjective({
  objective,
  resume_state = null,
  external_research = null,
  repository_impact = null,
  specialist_review = null,
  engineering_plan = null,
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
        "Treat independent specialist reviews as advisory evidence, not authority. Resolve disagreement with the current repository, owner intent and deterministic verification.",
        "Do not reopen satisfied discovery when the controller has locked discovery. Do not add abstraction or novelty without repository evidence that it reduces duplication, risk, or complexity.",
      ].join("\n")
    : [
        STRATEGIC_PROTOCOL_MARKER,
        "STRATEGIC ENGINEERING MODE: do not default to the first plausible patch. Use the already-loaded Fast Start repository evidence as a map and compare viable implementation shapes before mutation whenever the repository shows a meaningful choice.",
        "Evaluate four lenses before choosing the edit: (1) the direct target/root cause, (2) callers/consumers and compatibility boundaries, (3) analogous implementations or reusable mechanisms elsewhere in the repository, and (4) tests, contracts and verification surfaces.",
        "Prefer an existing reusable architecture over a duplicate mechanism. Prefer a root-cause fix over a symptom patch. Prefer a bounded local fix when centralization or abstraction would increase blast radius without a demonstrated benefit.",
        "For architecture, performance, concurrency, reliability, or scaling work, consider whether a data-flow, state-machine, algorithmic, caching, batching, concurrency, lifecycle, or ownership change is materially better than a line-level patch. Do not be novel merely to be different.",
        "Use cross-repository search evidence to look outside the obvious folder. A nearby implementation is not automatically the best precedent; compare semantics and constraints before reuse.",
        "Treat independent specialist reviews as advisory evidence, not authority. Resolve disagreement with the current repository, owner intent and deterministic verification. Do not average incompatible recommendations.",
        "Keep the work package batched. Spend model calls on engineering judgment, not repeated navigation that deterministic repository search can provide.",
        "In the work-package summary, state the selected implementation direction and one materially different alternative that was rejected, with concise evidence-based reasons. This is a decision record, not private chain-of-thought.",
      ].join("\n");
  const planContext = formatCodeAIEngineeringPlanForObjective(engineering_plan);
  const impactContext = formatCodeAIRepositoryImpactForObjective(repository_impact);
  const researchContext = formatCodeAIStrategicExternalResearchForObjective(external_research);
  const specialistContext = formatCodeAIParallelSpecialistReviewForObjective(specialist_review);

  return [goal, protocol, planContext, impactContext, researchContext, specialistContext]
    .filter(Boolean)
    .join("\n\n");
}

function strategicMetadata({
  result,
  resumeState,
  externalResearch,
  repositoryImpact,
  specialistReview,
  engineeringPlan,
}) {
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
    engineering_plan_contract: CODE_AI_ENGINEERING_PLAN_CONTRACT,
    engineering_plan_revision: Number(engineeringPlan?.revision || 0),
    engineering_plan_progress_percent: Number(engineeringPlan?.progress_percent || 0),
    engineering_plan_current_phase: text(engineeringPlan?.current_phase, 120) || null,
    engineering_plan_dynamic_reconciliation: true,
    engineering_plan_business_outcome_progress_primary: true,
    engineering_plan_authorization_effect: "NONE",
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
    parallel_specialist_review_contract: CODE_AI_PARALLEL_SPECIALIST_REVIEW_CONTRACT,
    parallel_specialist_review_status: text(specialistReview?.status, 160) || null,
    parallel_specialist_review_completed: specialistReview?.completed === true,
    parallel_specialist_concurrent_dispatch: specialistReview?.concurrent_dispatch === true,
    parallel_specialist_reviewer_count_requested:
      Number(specialistReview?.reviewer_count_requested || 0),
    parallel_specialist_reviewer_count_succeeded:
      Number(specialistReview?.reviewer_count_succeeded || 0),
    parallel_specialist_single_writer_preserved:
      specialistReview?.single_writer_code_implementation_preserved !== false,
    parallel_specialist_source_mutation_authority: false,
    extra_code_reasoning_calls_required_by_strategy: 0,
    decision_record_observed:
      summary.includes("alternative") ||
      summary.includes("strategy") ||
      summary.includes("approach"),
    raw_reasoning_persisted: false,
    authorization_effect: "NONE",
  };
}

function researchBlockedResult({
  originalObjective,
  resumeState,
  research,
  repositoryImpact,
  engineeringPlan,
}) {
  const blockedState = {
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
  const blockedPlan = reconcileCodeAIEngineeringPlan({
    objective: originalObjective,
    ownerIntent: blockedState?.employee_mission?.owner_intent || originalObjective,
    state: blockedState,
    previousPlan: engineeringPlan,
  });
  const state = bindCodeAIEngineeringPlanToState(blockedState, blockedPlan);
  const strategic = strategicMetadata({
    result: { summary: null },
    resumeState,
    externalResearch: research,
    repositoryImpact,
    specialistReview: null,
    engineeringPlan: blockedPlan,
  });
  state.strategic_reasoning = strategic;
  return {
    success: false,
    status: "blocked",
    reason: state.blockers[0],
    state,
    engineering_plan: blockedPlan,
    strategic_reasoning: strategic,
    repository_impact: repositoryImpact,
    strategic_external_research: research,
    reasoning_calls: Number(state?.work_package_control?.reasoning_calls_used || 0),
  };
}

export async function executeCodeAIStrategicBatchedMission(input = {}) {
  const originalObjective = text(input.objective, 9000);
  const initialPlanningState = stateForPlanning(input, originalObjective);
  const initialPlan = reconcileCodeAIEngineeringPlan({
    objective: originalObjective,
    ownerIntent:
      initialPlanningState?.employee_mission?.owner_intent || input.owner_intent || originalObjective,
    state: initialPlanningState,
    previousPlan: initialPlanningState.engineering_plan,
    ownerIntervention: initialPlanningState.owner_intervention,
  });
  const plannedResumeState = bindCodeAIEngineeringPlanToState(
    initialPlanningState,
    initialPlan,
  );
  const repositoryImpact = deriveCodeAIRepositoryImpact(plannedResumeState);
  const research = await resolveStrategicResearch({
    context: input.context,
    objective: originalObjective,
    resumeState: plannedResumeState,
  });

  if (
    research?.required === true &&
    research?.strict_required === true &&
    text(research?.status, 160) === "RESEARCH_UNAVAILABLE"
  ) {
    return researchBlockedResult({
      originalObjective,
      resumeState: plannedResumeState,
      research,
      repositoryImpact,
      engineeringPlan: initialPlan,
    });
  }

  const specialistReview = await resolveParallelSpecialistCouncil({
    context: input.context,
    objective: originalObjective,
    resumeState: plannedResumeState,
    repositoryImpact,
    externalResearch: research,
  });

  const strategicObjective = buildCodeAIStrategicObjective({
    objective: originalObjective,
    resume_state: plannedResumeState,
    external_research: research,
    repository_impact: repositoryImpact,
    specialist_review: specialistReview,
    engineering_plan: initialPlan,
  });
  const result = await executeBatchedAutonomousCodeMissionWithDeterministicConvergence({
    ...input,
    objective: strategicObjective,
    resume_state: plannedResumeState,
  });
  const postState = stateForPlanning({
    ...input,
    resume_state: result?.state || plannedResumeState,
  }, originalObjective);
  const postPlan = reconcileCodeAIEngineeringPlan({
    objective: originalObjective,
    ownerIntent:
      postState?.employee_mission?.owner_intent || input.owner_intent || originalObjective,
    state: postState,
    previousPlan: initialPlan,
    ownerIntervention: postState.owner_intervention,
  });
  const stateWithPlan = bindCodeAIEngineeringPlanToState(postState, postPlan);
  const strategic = strategicMetadata({
    result,
    resumeState: plannedResumeState,
    externalResearch: research,
    repositoryImpact,
    specialistReview,
    engineeringPlan: postPlan,
  });

  return {
    ...object(result),
    state: result?.state
      ? {
          ...stateWithPlan,
          objective: originalObjective || text(result.state.objective, 9000),
          strategic_reasoning: strategic,
          repository_impact: repositoryImpact,
          strategic_external_research: research,
          parallel_specialist_review: specialistReview,
        }
      : result?.state,
    engineering_plan: postPlan,
    strategic_reasoning: strategic,
    repository_impact: repositoryImpact,
    strategic_external_research: research,
    parallel_specialist_review: specialistReview,
  };
}

export const CodeAIStrategicReasoningRuntime = Object.freeze({
  contract: CODE_AI_STRATEGIC_REASONING_CONTRACT,
  repository_impact_contract: CODE_AI_REPOSITORY_IMPACT_CONTRACT,
  external_research_contract: CODE_AI_STRATEGIC_EXTERNAL_RESEARCH_CONTRACT,
  parallel_specialist_review_contract: CODE_AI_PARALLEL_SPECIALIST_REVIEW_CONTRACT,
  engineering_plan_contract: CODE_AI_ENGINEERING_PLAN_CONTRACT,
  engineering_plan_dynamic_reconciliation: true,
  engineering_plan_business_outcome_progress_primary: true,
  protocol: STRATEGIC_PROTOCOL_MARKER,
  buildObjective: buildCodeAIStrategicObjective,
  execute: executeCodeAIStrategicBatchedMission,
});

export default CodeAIStrategicReasoningRuntime;
