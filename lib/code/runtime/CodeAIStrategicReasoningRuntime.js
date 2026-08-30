import {
  executeBatchedAutonomousCodeMissionWithDeterministicConvergence,
} from "./CodeAIWorkPackageDeterministicConvergenceRuntime.js";

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

export function buildCodeAIStrategicObjective({
  objective,
  resume_state = null,
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

  return `${goal}\n\n${protocol}`;
}

function strategicMetadata({ result, resumeState }) {
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
    extra_reasoning_calls_required_by_protocol: 0,
    decision_record_observed:
      summary.includes("alternative") ||
      summary.includes("strategy") ||
      summary.includes("approach"),
    raw_reasoning_persisted: false,
    authorization_effect: "NONE",
  };
}

export async function executeCodeAIStrategicBatchedMission(input = {}) {
  const originalObjective = text(input.objective, 9000);
  const strategicObjective = buildCodeAIStrategicObjective({
    objective: originalObjective,
    resume_state: input.resume_state,
  });
  const result = await executeBatchedAutonomousCodeMissionWithDeterministicConvergence({
    ...input,
    objective: strategicObjective,
  });
  const strategic = strategicMetadata({ result, resumeState: input.resume_state });

  return {
    ...object(result),
    state: result?.state
      ? {
          ...object(result.state),
          objective: originalObjective || text(result.state.objective, 9000),
          strategic_reasoning: strategic,
        }
      : result?.state,
    strategic_reasoning: strategic,
  };
}

export const CodeAIStrategicReasoningRuntime = Object.freeze({
  contract: CODE_AI_STRATEGIC_REASONING_CONTRACT,
  protocol: STRATEGIC_PROTOCOL_MARKER,
  buildObjective: buildCodeAIStrategicObjective,
  execute: executeCodeAIStrategicBatchedMission,
});

export default CodeAIStrategicReasoningRuntime;