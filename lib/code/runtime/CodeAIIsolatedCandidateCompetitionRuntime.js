import {
  executeBatchedAutonomousCodeMissionWithDeterministicConvergence,
} from "./CodeAIWorkPackageDeterministicConvergenceRuntime.js";

export const CODE_AI_ISOLATED_CANDIDATE_EXECUTION_CONTRACT =
  "AVANTIQO_CODE_AI_ISOLATED_CANDIDATE_EXECUTION_V1";

function text(value, maximum = 6000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function reasoningCalls(state) {
  const value = Number(state?.work_package_control?.reasoning_calls_used || 0);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function candidateMissionId(baseMissionId, index) {
  const base = text(baseMissionId, 200);
  return base ? `${base}:candidate:${index}`.slice(0, 240) : null;
}

function candidateObjective(objective, candidate, index) {
  return [
    text(objective, 10000),
    "ISOLATED IMPLEMENTATION CANDIDATE TRIAL.",
    `Candidate ${index}: ${text(candidate?.direction, 2200)}`,
    "Use at most one fresh Code reasoning call for this trial. Work only inside the ephemeral workspace/worktree. Produce a coherent implementation plus verification and final diff if feasible. Do not commit, push, deploy, publish, migrate production data, or weaken governance. This candidate has no authority until deterministic selection.",
  ].filter(Boolean).join("\n\n");
}

function candidateResumeState(resumeState, candidate, index) {
  const source = object(resumeState);
  const baseMissionId = source.mission_id;
  return {
    ...source,
    mission_id: candidateMissionId(baseMissionId, index),
    isolated_candidate_trial: {
      contract: CODE_AI_ISOLATED_CANDIDATE_EXECUTION_CONTRACT,
      candidate_index: index,
      strategy_id: text(candidate?.id, 160) || null,
      strategy_direction: text(candidate?.direction, 2200) || null,
      parent_mission_id: text(baseMissionId, 240) || null,
      commit_authority: false,
      deploy_authority: false,
      authorization_effect: "NONE",
    },
  };
}

function candidateScore(result) {
  const source = object(result);
  const state = object(source.state);
  const verificationPassed = list(state.verification)
    .filter((entry) => entry?.passed === true).length;
  const failures = list(state.failures).length;
  const changed = list(state.files_changed).length;
  const hasPatch = Boolean(text(state.patch, 1));
  const completed = source.success === true && text(source.status, 100) === "completed";
  let score = completed ? 70 : 10;
  score += Math.min(20, verificationPassed * 5);
  score += hasPatch ? 6 : 0;
  score += changed > 0 ? 4 : 0;
  score -= Math.min(24, failures * 6);
  score -= Math.min(8, reasoningCalls(state));
  return Math.max(0, Math.min(100, score));
}

function candidateSummary(entry, index) {
  if (entry.status !== "fulfilled") {
    return {
      candidate_index: index,
      status: "EXECUTION_ERROR",
      completed: false,
      score: 0,
      reason: text(entry.reason?.message || entry.reason, 600) || "UNKNOWN",
      files_changed: [],
      reasoning_calls: 0,
    };
  }
  const result = object(entry.value);
  const state = object(result.state);
  return {
    candidate_index: index,
    status: text(result.status, 100) || "unknown",
    completed: result.success === true && text(result.status, 100) === "completed",
    score: candidateScore(result),
    reason: text(result.reason, 600) || null,
    files_changed: list(state.files_changed).slice(0, 40),
    verification_passed: list(state.verification).filter((item) => item?.passed === true).length,
    failure_count: list(state.failures).length,
    reasoning_calls: reasoningCalls(state),
    patch_present: Boolean(text(state.patch, 1)),
  };
}

function eligibleForTrial({ policy, strategyCompetition, resumeState }) {
  if (policy?.enabled !== true) return false;
  if (list(strategyCompetition?.ranked).length < 2) return false;
  if (resumeState?.planner_pending) return false;
  if (text(resumeState?.owner_intervention?.status, 80) === "CLAIMED") return false;
  return true;
}

export async function runCodeAIIsolatedCandidateCompetition({
  policy = null,
  strategy_competition = null,
  input = null,
  resume_state = null,
  dependencies = {},
} = {}) {
  const strategyCompetition = object(strategy_competition);
  const resumeState = object(resume_state);
  if (!eligibleForTrial({ policy, strategyCompetition, resumeState })) {
    return {
      contract: CODE_AI_ISOLATED_CANDIDATE_EXECUTION_CONTRACT,
      status: "NOT_RUN",
      executed: false,
      candidate_count: 0,
      candidates: [],
      winner_index: null,
      winner_result: null,
      source_mutation_authority: false,
      main_branch_parallel_mutation_forbidden: true,
      commit_authority: false,
      deploy_authority: false,
    };
  }

  const ranked = list(strategyCompetition.ranked).slice(0, 2);
  const executeCandidate = typeof dependencies.executeCandidate === "function"
    ? dependencies.executeCandidate
    : executeBatchedAutonomousCodeMissionWithDeterministicConvergence;
  const baseUsed = reasoningCalls(resumeState);
  const trialBudget = Math.min(8, Math.max(1, baseUsed + 1));
  const candidateInputs = ranked.map((candidate, index) => ({
    ...object(input),
    objective: candidateObjective(input?.objective, candidate, index + 1),
    resume_state: candidateResumeState(resumeState, candidate, index + 1),
    reasoning_call_budget: trialBudget,
  }));

  const startedAt = Date.now();
  const settled = await Promise.allSettled(
    candidateInputs.map((candidateInput) => executeCandidate(candidateInput)),
  );
  const summaries = settled.map((entry, index) => ({
    ...candidateSummary(entry, index + 1),
    strategy_id: text(ranked[index]?.id, 160) || null,
    strategy_direction: text(ranked[index]?.direction, 2200) || null,
  }));
  const completed = summaries
    .map((summary, index) => ({ summary, index }))
    .filter(({ summary }) => summary.completed)
    .sort((left, right) =>
      right.summary.score - left.summary.score ||
      left.summary.candidate_index - right.summary.candidate_index
    );
  const winner = completed[0] || null;
  const winnerResult = winner && settled[winner.index].status === "fulfilled"
    ? settled[winner.index].value
    : null;

  return {
    contract: CODE_AI_ISOLATED_CANDIDATE_EXECUTION_CONTRACT,
    status: winner ? "WINNER_SELECTED" : "NO_PROVEN_WINNER",
    executed: true,
    concurrent_execution: true,
    elapsed_ms: Date.now() - startedAt,
    candidate_count: summaries.length,
    candidates: summaries,
    winner_index: winner?.summary?.candidate_index || null,
    winner_strategy_id: winner?.summary?.strategy_id || null,
    winner_result: winnerResult,
    fallback_to_single_writer_required: !winnerResult,
    trial_reasoning_calls_per_candidate_maximum: 1,
    source_mutation_authority: false,
    main_branch_parallel_mutation_forbidden: true,
    ephemeral_isolation_required: true,
    commit_authority: false,
    deploy_authority: false,
    authorization_effect: "NONE",
    raw_reasoning_persisted: false,
  };
}

export const CodeAIIsolatedCandidateCompetitionRuntime = Object.freeze({
  contract: CODE_AI_ISOLATED_CANDIDATE_EXECUTION_CONTRACT,
  execute: runCodeAIIsolatedCandidateCompetition,
  parallel_main_mutation_allowed: false,
  ephemeral_isolation_required: true,
});

export default CodeAIIsolatedCandidateCompetitionRuntime;
