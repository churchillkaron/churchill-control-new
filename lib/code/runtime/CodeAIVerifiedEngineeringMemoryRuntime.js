import {
  searchCodeAIMissionHistory,
  loadCodeAIMissionHistoryDetail,
} from "@/lib/code/runtime/CodeAIMissionHistoryRuntime";
import {
  loadCodeAIEngineeringMemoryUtilityScores,
  CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT,
} from "@/lib/code/runtime/CodeAIEngineeringMemoryUtilityRuntime";

export const CODE_AI_VERIFIED_ENGINEERING_MEMORY_CONTRACT =
  "AVANTIQO_CODE_AI_VERIFIED_ENGINEERING_MEMORY_V1";

const MAX_MATCHES = 3;
const MAX_CANDIDATES = 8;
const MAX_FILES_PER_MATCH = 8;
const MAX_VERIFIERS_PER_MATCH = 6;

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizedRepository(value) {
  return text(value, 1000)
    .toLowerCase()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
}

function safeMatch(session = {}, detail = null, utility = null) {
  const source = detail || session;
  const utilityScore = Number(utility?.utility_score ?? 0.7333);
  const rankingMultiplier = Number(utility?.ranking_multiplier ?? 1);
  const relevanceScore = Number(session.relevance_score || 0);
  return {
    mission_id: text(session.mission_id, 240) || null,
    objective: text(session.objective, 1200) || null,
    repository_url: text(session.repository_url, 1000) || null,
    ref: text(session.ref, 160) || null,
    base_commit: text(session.base_commit, 160) || null,
    relevance_score: relevanceScore,
    adjusted_relevance_score: Number((relevanceScore * rankingMultiplier).toFixed(4)),
    matched_fields: list(session.matched_fields).slice(0, 8),
    files_changed: list(source.files_changed)
      .slice(0, MAX_FILES_PER_MATCH)
      .map((item) => text(item, 1000))
      .filter(Boolean),
    successful_verifiers: list(source.successful_verifiers)
      .slice(0, MAX_VERIFIERS_PER_MATCH)
      .map((entry) => ({
        command: text(entry?.command, 300) || null,
        args: list(entry?.args).slice(0, 16).map((arg) => text(arg, 500)).filter(Boolean),
      }))
      .filter((entry) => entry.command),
    repaired_verifiers: list(source.repaired_verifiers)
      .slice(0, MAX_VERIFIERS_PER_MATCH)
      .map((entry) => ({
        command: text(entry?.command, 300) || null,
        args: list(entry?.args).slice(0, 16).map((arg) => text(arg, 500)).filter(Boolean),
        failed_exit_code:
          entry?.failed_exit_code === null || entry?.failed_exit_code === undefined
            ? null
            : Number(entry.failed_exit_code),
        later_exit_code:
          entry?.later_exit_code === null || entry?.later_exit_code === undefined
            ? null
            : Number(entry.later_exit_code),
        repaired: entry?.repaired === true,
      }))
      .filter((entry) => entry.command && entry.repaired),
    verified_complete: session.verified_complete === true,
    integrity_verified: session.integrity_verified === true,
    utility: utility ? {
      contract: CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT,
      observation_count: Number(utility.observation_count || 0),
      validation_success_count: Number(utility.validation_success_count || 0),
      useful_completion_count: Number(utility.useful_completion_count || 0),
      investigation_efficiency_signal_count:
        Number(utility.investigation_efficiency_signal_count || 0),
      stale_signal_count: Number(utility.stale_signal_count || 0),
      contradiction_signal_count: Number(utility.contradiction_signal_count || 0),
      utility_score: utilityScore,
      ranking_multiplier: rankingMultiplier,
      downranked: utility.downranked === true,
      suppressed: utility.suppressed === true,
      ranking_effect: text(utility.ranking_effect, 160) || "NEUTRAL",
      average_reasoning_calls:
        utility.average_reasoning_calls == null
          ? null
          : Number(utility.average_reasoning_calls),
      average_discovery_operations_before_first_mutation:
        utility.average_discovery_operations_before_first_mutation == null
          ? null
          : Number(utility.average_discovery_operations_before_first_mutation),
    } : {
      contract: CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT,
      observation_count: 0,
      utility_score: utilityScore,
      ranking_multiplier: 1,
      downranked: false,
      suppressed: false,
      ranking_effect: "UNOBSERVED_NEUTRAL",
    },
    current_head_revalidation_required: true,
    authorization_effect: "NONE",
  };
}

function formatVerifier(entry = {}) {
  return [entry.command, ...list(entry.args)].filter(Boolean).join(" ");
}

export function formatCodeAIVerifiedEngineeringMemoryForObjective(memory = {}) {
  const matches = list(memory.matches);
  if (!matches.length) return "";
  const lines = [
    "VERIFIED ENGINEERING MEMORY (NON-AUTHORITATIVE):",
    "These are attested, previously verified Code missions from the same organization/actor and repository. They are evidence leads only. Re-read every cited path from the current repository HEAD before relying on it. Re-run relevant verification after any mutation. Never replay an old patch or assume an old base commit is current.",
    "Observed utility may adjust ranking, but it never converts memory into authority. A down-ranked precedent can still be inspected; repeated direct current-HEAD contradictions may suppress it from automatic reuse.",
  ];
  for (const match of matches) {
    lines.push(
      `- Prior mission ${match.mission_id}: ${match.objective || "verified engineering outcome"}`,
      `  prior base: ${match.base_commit || "unknown"}; relevance: ${match.relevance_score}; adjusted relevance: ${match.adjusted_relevance_score}; utility: ${match.utility?.ranking_effect || "UNOBSERVED_NEUTRAL"}; current HEAD revalidation required`,
    );
    if (match.files_changed.length) {
      lines.push(`  cited paths: ${match.files_changed.join(", ")}`);
    }
    if (match.repaired_verifiers.length) {
      lines.push(
        `  repaired verifier evidence: ${match.repaired_verifiers.map(formatVerifier).join(" | ")}`,
      );
    } else if (match.successful_verifiers.length) {
      lines.push(
        `  successful verifier evidence: ${match.successful_verifiers.map(formatVerifier).join(" | ")}`,
      );
    }
  }
  lines.push(
    "Use these memories only to accelerate search, compare analogous solutions, and avoid repeating verified mistakes. Current repository evidence and deterministic verification remain authoritative.",
  );
  return lines.join("\n");
}

async function utilityScoresForCandidates({ context, sessions, repositoryUrl, ref }) {
  const missionIds = list(sessions)
    .map((session) => text(session?.mission_id, 240))
    .filter(Boolean);
  if (!missionIds.length) return {};
  try {
    const loaded = await loadCodeAIEngineeringMemoryUtilityScores({
      context,
      sourceMissionIds: missionIds,
      repositoryUrl,
      ref,
    });
    return object(loaded.scores);
  } catch (error) {
    console.error(JSON.stringify({
      event: "AVANTIQO_CODE_ENGINEERING_MEMORY_UTILITY_SCORE_LOAD_FAILED",
      reason: text(error?.message || error, 500),
      engineering_memory_retrieval_blocked: false,
      authorization_effect: "NONE",
    }));
    return {};
  }
}

export async function retrieveCodeAIVerifiedEngineeringMemory({
  context = {},
  objective,
  repositoryUrl,
  ref = "main",
  excludeMissionId = null,
  limit = MAX_MATCHES,
} = {}) {
  const goal = text(objective, 4000);
  const repository = text(repositoryUrl, 1000);
  if (!goal || !repository) {
    return {
      contract: CODE_AI_VERIFIED_ENGINEERING_MEMORY_CONTRACT,
      evaluated: false,
      matches: [],
      count: 0,
      reason: "OBJECTIVE_AND_REPOSITORY_REQUIRED",
      authorization_effect: "NONE",
    };
  }

  const history = await searchCodeAIMissionHistory({
    context,
    query: goal,
    verifiedOnly: true,
    repositoryUrl: repository,
    ref,
    limit: Math.min(MAX_CANDIDATES, Math.max(MAX_MATCHES, Number(limit || MAX_MATCHES) * 2)),
  });
  const candidates = list(history.sessions)
    .filter((session) => session.mission_id !== text(excludeMissionId, 240))
    .filter((session) => session.verified_complete === true && session.integrity_verified === true)
    .filter((session) => normalizedRepository(session.repository_url) === normalizedRepository(repository));
  const utilityScores = await utilityScoresForCandidates({
    context,
    sessions: candidates,
    repositoryUrl: repository,
    ref,
  });
  const ranked = candidates
    .map((session) => {
      const utility = object(utilityScores[text(session.mission_id, 240)]);
      const multiplier = Number(utility.ranking_multiplier || 1);
      return {
        session,
        utility,
        adjusted_relevance_score:
          Number(session.relevance_score || 0) * (Number.isFinite(multiplier) ? multiplier : 1),
      };
    })
    .filter((entry) => entry.utility.suppressed !== true)
    .sort((left, right) => {
      if (right.adjusted_relevance_score !== left.adjusted_relevance_score) {
        return right.adjusted_relevance_score - left.adjusted_relevance_score;
      }
      return Number(right.session.relevance_score || 0) - Number(left.session.relevance_score || 0);
    })
    .slice(0, Math.min(MAX_MATCHES, Math.max(1, Number(limit || MAX_MATCHES))));

  const matches = [];
  for (const entry of ranked) {
    const detail = await loadCodeAIMissionHistoryDetail({
      context,
      missionId: entry.session.mission_id,
    });
    if (!detail?.found || detail.session?.verified_complete !== true) continue;
    matches.push(safeMatch(entry.session, detail.session, entry.utility));
  }

  return {
    contract: CODE_AI_VERIFIED_ENGINEERING_MEMORY_CONTRACT,
    evaluated: true,
    matches,
    count: matches.length,
    search_contract: history.contract || null,
    utility_contract: CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT,
    candidate_count_before_utility: candidates.length,
    suppressed_candidate_count:
      candidates.filter((session) =>
        object(utilityScores[text(session.mission_id, 240)]).suppressed === true
      ).length,
    utility_adjusted_ranking: true,
    direct_current_head_contradiction_required_for_penalty: true,
    ordinary_mission_failure_causes_penalty: false,
    same_repository_required: true,
    attestation_required: true,
    verified_completion_required: true,
    current_head_revalidation_required: true,
    patch_replay_allowed: false,
    raw_patch_returned: false,
    raw_source_returned: false,
    raw_reasoning_returned: false,
    automatic_knowledge_promotion: false,
    authorization_effect: "NONE",
    commit_authority: false,
    production_deploy_authority: false,
  };
}

export const CodeAIVerifiedEngineeringMemoryRuntime = Object.freeze({
  contract: CODE_AI_VERIFIED_ENGINEERING_MEMORY_CONTRACT,
  utility_contract: CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT,
  retrieve: retrieveCodeAIVerifiedEngineeringMemory,
  formatForObjective: formatCodeAIVerifiedEngineeringMemoryForObjective,
  utility_adjusted_ranking: true,
  direct_current_head_contradiction_required_for_penalty: true,
  ordinary_mission_failure_causes_penalty: false,
  current_head_revalidation_required: true,
  patch_replay_allowed: false,
  authorization_effect: "NONE",
});

export default CodeAIVerifiedEngineeringMemoryRuntime;
