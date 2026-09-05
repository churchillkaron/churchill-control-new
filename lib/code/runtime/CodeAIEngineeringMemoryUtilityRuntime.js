import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT =
  "AVANTIQO_CODE_AI_ENGINEERING_MEMORY_UTILITY_V1";

const MEMORY_TABLE = "intelligence_memories";
const MEMORY_SCOPE = "code_ai_engineering_memory_utility_observation";
const MEMORY_SOURCE = "code_ai_engineering_memory_utility_runtime";
const MAX_ROWS = 320;
const MAX_MATCHES = 3;
const MAX_PATHS = 12;
const MAX_VERIFIERS = 8;
const MUTATION_ACTIONS = new Set(["apply_files", "delete_files", "rename_files"]);

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function organizationId(context = {}) {
  return text(context.organizationId || context.organization_id, 160) || null;
}

function actorId(context = {}) {
  return text(context?.actor?.id || context?.actor?.user_id, 160) || null;
}

function normalizedRepository(value) {
  return text(value, 1000)
    .toLowerCase()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
}

function verifierKey(entry = {}) {
  const command = text(entry.command, 300);
  const args = list(entry.args).slice(0, 16).map((item) => text(item, 500)).filter(Boolean);
  return [command, ...args].filter(Boolean).join("\u0000");
}

function operationEntries(state = {}) {
  return list(state.evidence)
    .filter((entry) => text(entry?.kind, 120) === "operation")
    .map((entry, index) => ({
      index,
      at: text(entry?.at, 120) || null,
      action: text(entry?.action, 80).toLowerCase(),
      status: text(entry?.status, 80).toLowerCase(),
      result: object(entry?.result),
      operation_id: text(entry?.operation_id, 240) || null,
    }));
}

function firstMutationBoundary(state = {}) {
  const operations = operationEntries(state);
  const mutation = operations.find((entry) =>
    entry.status === "completed" && MUTATION_ACTIONS.has(entry.action)
  );
  return {
    operation_index: mutation?.index ?? null,
    at: mutation?.at || null,
    epoch_ms: mutation?.at && Number.isFinite(Date.parse(mutation.at))
      ? Date.parse(mutation.at)
      : null,
  };
}

function successfulReadPaths(state = {}) {
  return new Set(
    operationEntries(state)
      .filter((entry) => entry.action === "read" && entry.status === "completed")
      .map((entry) => text(entry.result.file_path || entry.result.path, 1000))
      .filter(Boolean),
  );
}

function failedReadPaths(state = {}) {
  return new Set(
    operationEntries(state)
      .filter((entry) => entry.action === "read" && entry.status && entry.status !== "completed")
      .map((entry) => text(entry.result.file_path || entry.result.path, 1000))
      .filter(Boolean),
  );
}

function currentTests(state = {}) {
  return list(state.tests).slice(-40).map((entry) => {
    const exitCode = Number(entry?.exit_code);
    const at = text(entry?.at, 120) || null;
    return {
      at,
      epoch_ms: at && Number.isFinite(Date.parse(at)) ? Date.parse(at) : null,
      command: text(entry?.command, 300) || null,
      args: list(entry?.args).slice(0, 16).map((item) => text(item, 500)).filter(Boolean),
      exit_code: Number.isFinite(exitCode) ? exitCode : null,
    };
  }).filter((entry) => entry.command && entry.exit_code !== null);
}

function verifiedComplete(result = {}) {
  const completion = object(result.employee_completion || result.state?.employee_completion);
  const quality = object(completion.worldclass_quality);
  const productCompletion = object(completion.product_completion_criteria);
  const reviewGate = object(result.state?.final_independent_review_gate);
  return Boolean(
    result.success === true &&
    text(result.status || result.state?.status, 100).toLowerCase() === "completed" &&
    completion.complete === true &&
    completion.verified === true &&
    completion.final_diff_observed === true &&
    quality.verified === true &&
    (productCompletion.required !== true || productCompletion.verified === true) &&
    (reviewGate.required !== true || reviewGate.verified === true)
  );
}

function reasoningCalls(result = {}) {
  const candidates = [
    result?.state?.work_package_control?.reasoning_calls_used,
    result?.reasoning_calls,
    result?.employee_completion?.reasoning_calls_used,
  ];
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function discoveryFootprint(state = {}) {
  const operations = operationEntries(state);
  const boundary = firstMutationBoundary(state);
  const beforeMutation = boundary.operation_index === null
    ? operations
    : operations.filter((entry) => entry.index < boundary.operation_index);
  const searches = beforeMutation.filter(
    (entry) => entry.action === "search" && entry.status === "completed",
  ).length;
  const reads = beforeMutation.filter(
    (entry) => entry.action === "read" && entry.status === "completed",
  ).length;
  return {
    deterministic_searches_before_first_mutation: searches,
    deterministic_reads_before_first_mutation: reads,
    deterministic_discovery_operations_before_first_mutation: searches + reads,
    first_mutation_observed: boundary.operation_index !== null,
    first_mutation_at: boundary.at,
  };
}

function assessMatch(match = {}, result = {}) {
  const state = object(result.state);
  const citedPaths = list(match.files_changed)
    .slice(0, MAX_PATHS)
    .map((item) => text(item, 1000))
    .filter(Boolean);
  const successfulReads = successfulReadPaths(state);
  const failedReads = failedReadPaths(state);
  const citedPathsSurvived = citedPaths.filter((path) => successfulReads.has(path));
  const citedPathsStale = citedPaths.filter((path) => failedReads.has(path));
  const tests = currentTests(state);
  const boundary = firstMutationBoundary(state);
  const rememberedVerifiers = [
    ...list(match.repaired_verifiers),
    ...list(match.successful_verifiers),
  ]
    .slice(0, MAX_VERIFIERS)
    .map((entry) => ({
      command: text(entry?.command, 300) || null,
      args: list(entry?.args).slice(0, 16).map((item) => text(item, 500)).filter(Boolean),
    }))
    .filter((entry) => entry.command);
  const rememberedKeys = new Set(rememberedVerifiers.map(verifierKey).filter(Boolean));
  const verifierChecks = tests.filter((entry) => rememberedKeys.has(verifierKey(entry)));
  const verifierPasses = verifierChecks.filter((entry) => entry.exit_code === 0);
  const preMutationVerifierFailures = verifierChecks.filter((entry) => {
    if (entry.exit_code === 0) return false;
    if (boundary.epoch_ms === null) return boundary.operation_index === null;
    return entry.epoch_ms !== null && entry.epoch_ms <= boundary.epoch_ms;
  });
  const referenceSurvived = citedPathsSurvived.length > 0 || verifierPasses.length > 0;
  const directStaleSignal =
    citedPathsStale.length > 0 || preMutationVerifierFailures.length > 0;
  const completionVerified = verifiedComplete(result);
  const footprint = discoveryFootprint(state);

  return {
    source_mission_id: text(match.mission_id, 240) || null,
    source_base_commit: text(match.base_commit, 160) || null,
    relevance_score: Number(match.relevance_score || match.adjusted_relevance_score || 0),
    cited_path_count: citedPaths.length,
    cited_paths_checked: citedPathsSurvived.length + citedPathsStale.length,
    cited_paths_survived: citedPathsSurvived.slice(0, MAX_PATHS),
    cited_paths_stale: citedPathsStale.slice(0, MAX_PATHS),
    remembered_verifier_count: rememberedVerifiers.length,
    remembered_verifier_checks: verifierChecks.length,
    remembered_verifier_passes: verifierPasses.length,
    remembered_verifier_pre_mutation_failures: preMutationVerifierFailures.length,
    current_head_reference_survived: referenceSurvived,
    current_head_direct_stale_signal: directStaleSignal,
    current_head_revalidation_observed:
      citedPathsSurvived.length + citedPathsStale.length + verifierChecks.length > 0,
    verified_current_mission_complete: completionVerified,
    useful_completion_signal: completionVerified && referenceSurvived,
    investigation_efficiency_observed:
      completionVerified &&
      referenceSurvived &&
      footprint.deterministic_discovery_operations_before_first_mutation <= 4,
    ...footprint,
  };
}

function observationFingerprint({ currentMissionId, sourceMissionId, state, assessment }) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({
      currentMissionId,
      sourceMissionId,
      baseCommit: text(state.base_commit, 160),
      status: text(state.status, 100),
      tests: list(state.tests).length,
      evidence: list(state.evidence).length,
      files: list(state.files_changed).length,
      stale: assessment.current_head_direct_stale_signal,
      survived: assessment.current_head_reference_survived,
      verified: assessment.verified_current_mission_complete,
    }), "utf8")
    .digest("hex")
    .slice(0, 40);
}

function memoryKey(actor, currentMissionId, sourceMissionId, fingerprint) {
  const digest = crypto
    .createHash("sha256")
    .update(`${actor}:${currentMissionId}:${sourceMissionId}:${fingerprint}`, "utf8")
    .digest("hex")
    .slice(0, 40);
  return `code_ai_engineering_memory_utility:v1:${digest}`;
}

async function existingObservation({ orgId, key }) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata,created_at,updated_at")
    .eq("organization_id", orgId)
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("memory_key", key)
    .limit(1);
  if (result.error) throw result.error;
  return result.data?.[0] || null;
}

export async function recordCodeAIEngineeringMemoryUtility({
  context = {},
  result = {},
} = {}) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  const state = object(result.state);
  const memory = object(result.verified_engineering_memory || state.verified_engineering_memory);
  const matches = list(memory.matches).slice(0, MAX_MATCHES);
  const currentMissionId = text(state.mission_id, 240);
  if (!orgId) throw new Error("CODE_AI_ENGINEERING_MEMORY_UTILITY_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("CODE_AI_ENGINEERING_MEMORY_UTILITY_ACTOR_REQUIRED");
  if (!currentMissionId || !matches.length) {
    return {
      contract: CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT,
      applicable: false,
      written: 0,
      observations: [],
      reason: !currentMissionId ? "CURRENT_MISSION_REQUIRED" : "NO_REUSED_ENGINEERING_MEMORY",
      authorization_effect: "NONE",
    };
  }

  const repositoryUrl = text(state.repository_url, 1000) || null;
  const ref = text(state.ref, 160) || "main";
  const now = new Date().toISOString();
  const observations = [];

  for (const match of matches) {
    const sourceMissionId = text(match?.mission_id, 240);
    if (!sourceMissionId || sourceMissionId === currentMissionId) continue;
    const assessment = assessMatch(match, result);
    const fingerprint = observationFingerprint({
      currentMissionId,
      sourceMissionId,
      state,
      assessment,
    });
    const key = memoryKey(actor, currentMissionId, sourceMissionId, fingerprint);
    const existing = await existingObservation({ orgId, key });
    if (existing?.id) {
      observations.push({
        written: false,
        idempotent: true,
        source_mission_id: sourceMissionId,
        assessment,
      });
      continue;
    }

    const inserted = await supabaseAdmin
      .from(MEMORY_TABLE)
      .insert({
        organization_id: orgId,
        party_id: null,
        entity_id: null,
        conversation_id: null,
        source_turn_id: null,
        memory_scope: MEMORY_SCOPE,
        memory_key: key,
        memory_type: "fact",
        subject: "Code AI Engineering Memory Utility",
        content:
          `Observed current-HEAD utility for prior Code mission ${sourceMissionId} while executing ${currentMissionId}.`,
        importance: 0.04,
        confidence: assessment.current_head_direct_stale_signal ? 1 : 0.9,
        source: MEMORY_SOURCE,
        active: true,
        metadata: {
          contract: CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT,
          actor_id: actor,
          current_mission_id: currentMissionId,
          source_mission_id: sourceMissionId,
          repository_url: repositoryUrl,
          ref,
          current_base_commit: text(state.base_commit, 160) || null,
          source_base_commit: assessment.source_base_commit,
          observation_fingerprint: fingerprint,
          observed_at: now,
          reasoning_calls_used: reasoningCalls(result),
          assessment,
          relationship: "OBSERVATIONAL_UTILITY_ONLY",
          causal_attribution_allowed: false,
          automatic_knowledge_promotion: false,
          current_head_revalidation_required: true,
          patch_replay_allowed: false,
          ordinary_memory_recall: false,
          authorization_effect: "NONE",
          commit_authority: false,
          production_deploy_authority: false,
        },
        updated_at: now,
      })
      .select("id,metadata,created_at,updated_at")
      .single();
    if (inserted.error) throw inserted.error;
    observations.push({
      written: true,
      idempotent: false,
      source_mission_id: sourceMissionId,
      assessment,
    });
  }

  return {
    contract: CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT,
    applicable: observations.length > 0,
    written: observations.filter((item) => item.written).length,
    observations,
    relationship: "OBSERVATIONAL_UTILITY_ONLY",
    causal_attribution_allowed: false,
    automatic_knowledge_promotion: false,
    authorization_effect: "NONE",
  };
}

function scoreObservations(rows = [], sourceMissionId) {
  const latestByCurrentMission = new Map();
  for (const row of rows) {
    const metadata = object(row.metadata);
    if (text(metadata.contract, 180) !== CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT) continue;
    if (text(metadata.source_mission_id, 240) !== sourceMissionId) continue;
    const currentMissionId = text(metadata.current_mission_id, 240);
    if (!currentMissionId || latestByCurrentMission.has(currentMissionId)) continue;
    latestByCurrentMission.set(currentMissionId, metadata);
  }
  const observations = [...latestByCurrentMission.values()];
  let validationSuccesses = 0;
  let usefulCompletions = 0;
  let efficiencySignals = 0;
  let staleSignals = 0;
  let contradictionSignals = 0;
  let reasoningCallTotal = 0;
  let reasoningCallSamples = 0;
  let discoveryTotal = 0;
  let discoverySamples = 0;

  for (const metadata of observations) {
    const assessment = object(metadata.assessment);
    if (assessment.current_head_reference_survived === true) validationSuccesses += 1;
    if (assessment.useful_completion_signal === true) usefulCompletions += 1;
    if (assessment.investigation_efficiency_observed === true) efficiencySignals += 1;
    if (assessment.current_head_direct_stale_signal === true) staleSignals += 1;
    const preMutationFailures = Number(
      assessment.remembered_verifier_pre_mutation_failures || 0,
    );
    if (preMutationFailures > 0) contradictionSignals += 1;
    const calls = Number(metadata.reasoning_calls_used);
    if (Number.isInteger(calls) && calls >= 0) {
      reasoningCallTotal += calls;
      reasoningCallSamples += 1;
    }
    const discovery = Number(
      assessment.deterministic_discovery_operations_before_first_mutation,
    );
    if (Number.isInteger(discovery) && discovery >= 0) {
      discoveryTotal += discovery;
      discoverySamples += 1;
    }
  }

  const positive = validationSuccesses + usefulCompletions + (efficiencySignals * 0.5);
  const negative = staleSignals + (contradictionSignals * 1.5);
  const utilityScore = Math.max(
    0.05,
    Math.min(0.98, (2.2 + positive) / (3 + positive + (2.5 * negative))),
  );
  const rankingMultiplier = Math.max(0.4, Math.min(1.2, 0.35 + (0.9 * utilityScore)));
  const suppressed =
    observations.length >= 2 &&
    staleSignals >= 2 &&
    contradictionSignals >= 1 &&
    utilityScore < 0.3;

  return {
    source_mission_id: sourceMissionId,
    observation_count: observations.length,
    validation_success_count: validationSuccesses,
    useful_completion_count: usefulCompletions,
    investigation_efficiency_signal_count: efficiencySignals,
    stale_signal_count: staleSignals,
    contradiction_signal_count: contradictionSignals,
    utility_score: Number(utilityScore.toFixed(4)),
    ranking_multiplier: Number(rankingMultiplier.toFixed(4)),
    downranked: rankingMultiplier < 0.9,
    suppressed,
    average_reasoning_calls:
      reasoningCallSamples > 0
        ? Number((reasoningCallTotal / reasoningCallSamples).toFixed(2))
        : null,
    average_discovery_operations_before_first_mutation:
      discoverySamples > 0
        ? Number((discoveryTotal / discoverySamples).toFixed(2))
        : null,
    ranking_effect: suppressed
      ? "SUPPRESSED_AFTER_REPEATED_DIRECT_CURRENT_HEAD_CONTRADICTION"
      : rankingMultiplier < 0.9
        ? "DOWNRANKED_BY_OBSERVED_CURRENT_HEAD_UTILITY"
        : rankingMultiplier > 1.05
          ? "BOOSTED_BY_OBSERVED_CURRENT_HEAD_UTILITY"
          : "NEUTRAL",
    causal_attribution_allowed: false,
    authorization_effect: "NONE",
  };
}

export async function loadCodeAIEngineeringMemoryUtilityScores({
  context = {},
  sourceMissionIds = [],
  repositoryUrl = null,
  ref = null,
} = {}) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  const ids = [...new Set(
    list(sourceMissionIds).map((item) => text(item, 240)).filter(Boolean),
  )].slice(0, 20);
  if (!orgId) throw new Error("CODE_AI_ENGINEERING_MEMORY_UTILITY_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("CODE_AI_ENGINEERING_MEMORY_UTILITY_ACTOR_REQUIRED");
  if (!ids.length) {
    return {
      contract: CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT,
      scores: {},
      authorization_effect: "NONE",
    };
  }

  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata,created_at,updated_at")
    .eq("organization_id", orgId)
    .eq("memory_scope", MEMORY_SCOPE)
    .contains("metadata", { actor_id: actor })
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (result.error) throw result.error;

  const targetRepository = normalizedRepository(repositoryUrl);
  const targetRef = text(ref, 160).toLowerCase();
  const rows = (result.data || []).filter((row) => {
    const metadata = object(row.metadata);
    if (!ids.includes(text(metadata.source_mission_id, 240))) return false;
    if (
      targetRepository &&
      normalizedRepository(metadata.repository_url) !== targetRepository
    ) return false;
    if (targetRef && text(metadata.ref, 160).toLowerCase() !== targetRef) return false;
    return true;
  });

  const scores = {};
  for (const sourceMissionId of ids) {
    scores[sourceMissionId] = scoreObservations(rows, sourceMissionId);
  }
  return {
    contract: CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT,
    scores,
    observation_rows_considered: rows.length,
    relationship: "OBSERVATIONAL_UTILITY_ONLY",
    causal_attribution_allowed: false,
    automatic_knowledge_promotion: false,
    authorization_effect: "NONE",
  };
}

export const CodeAIEngineeringMemoryUtilityRuntime = Object.freeze({
  contract: CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT,
  record: recordCodeAIEngineeringMemoryUtility,
  loadScores: loadCodeAIEngineeringMemoryUtilityScores,
  direct_current_head_contradiction_required_for_penalty: true,
  ordinary_mission_failure_causes_penalty: false,
  patch_replay_allowed: false,
  causal_attribution_allowed: false,
  authorization_effect: "NONE",
});

export default CodeAIEngineeringMemoryUtilityRuntime;
