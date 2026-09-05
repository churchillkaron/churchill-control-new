import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  sealAvantiqoLearningEvidenceCandidateAuthenticity,
  AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_CONTRACT,
} from "@/lib/intelligence/runtime/AvantiqoLearningEvidenceCandidateAuthenticityRuntime";

export const CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT =
  "AVANTIQO_CODE_AI_ENGINEERING_SKILL_LIFECYCLE_V1";

const MEMORY_TABLE = "intelligence_memories";
const OBSERVATION_SCOPE = "code_ai_engineering_skill_lifecycle_observation";
const OBSERVATION_SOURCE = "code_ai_engineering_skill_lifecycle_runtime";
const EVIDENCE_CANDIDATE_SCOPE = "platform_learning_evidence_candidates";
const EVIDENCE_CANDIDATE_CONTRACT =
  "AVANTIQO_CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_V1";
const LEARNING_ORGANIZATION_ENV = "AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID";
const MAX_OBSERVATION_ROWS = 480;
const MAX_SKILLS = 12;
const MAX_VERIFIERS = 8;
const MAX_AREAS = 16;
const MAX_SOURCE_MISSIONS = 12;
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

function normalizeArea(value) {
  return text(value, 1000).replace(/^\/+/, "").replace(/\/+$/, "");
}

function verifier(entry = {}) {
  const command = text(entry.command, 300);
  const args = list(entry.args)
    .slice(0, 16)
    .map((item) => text(item, 500))
    .filter(Boolean);
  return command ? { command, args } : null;
}

function verifierKey(entry = {}) {
  const normalized = verifier(entry);
  return normalized
    ? [normalized.command, ...normalized.args].join("\u0000")
    : null;
}

function verifierText(entry = {}) {
  const normalized = verifier(entry);
  return normalized ? [normalized.command, ...normalized.args].join(" ") : "";
}

function skillAreas(skill = {}) {
  return [...new Set([
    normalizeArea(skill.area),
    ...list(skill.evidence_areas).map(normalizeArea),
    ...list(skill.source_missions).flatMap((source) =>
      list(source?.areas).map(normalizeArea)
    ),
  ].filter(Boolean))].slice(0, MAX_AREAS);
}

function sourceBaseCommits(skill = {}) {
  return [...new Set(
    list(skill.source_missions)
      .map((source) => text(source?.base_commit, 160).toLowerCase())
      .filter(Boolean),
  )].slice(0, MAX_SOURCE_MISSIONS);
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
    }));
}

function firstMutationBoundary(state = {}) {
  const mutation = operationEntries(state).find(
    (entry) => entry.status === "completed" && MUTATION_ACTIONS.has(entry.action),
  );
  return {
    operation_index: mutation?.index ?? null,
    at: mutation?.at || null,
    epoch_ms:
      mutation?.at && Number.isFinite(Date.parse(mutation.at))
        ? Date.parse(mutation.at)
        : null,
  };
}

function beforeMutation(entry, boundary) {
  if (boundary.operation_index === null) return true;
  return entry.index < boundary.operation_index;
}

function readPath(entry = {}) {
  return text(entry?.result?.file_path || entry?.result?.path, 1000);
}

function pathWithinArea(path, area) {
  const normalizedPath = normalizeArea(path);
  const normalizedArea = normalizeArea(area);
  if (!normalizedPath || !normalizedArea) return false;
  return normalizedPath === normalizedArea || normalizedPath.startsWith(`${normalizedArea}/`);
}

function verifierEvidence(state = {}) {
  const values = [];
  for (const raw of [...list(state.tests), ...list(state.verification)]) {
    const normalized = verifier(raw);
    if (!normalized) continue;
    const exitCode = raw?.exit_code === null || raw?.exit_code === undefined
      ? null
      : Number(raw.exit_code);
    const at = text(raw?.at, 120) || null;
    values.push({
      ...normalized,
      key: verifierKey(normalized),
      at,
      epoch_ms: at && Number.isFinite(Date.parse(at)) ? Date.parse(at) : null,
      exit_code: Number.isFinite(exitCode) ? exitCode : null,
      passed: raw?.passed === true || exitCode === 0,
    });
  }
  return values.slice(-64);
}

function verifiedComplete(result = {}) {
  const state = object(result.state);
  const completion = object(result.employee_completion || state.employee_completion);
  const quality = object(completion.worldclass_quality);
  const productCompletion = object(completion.product_completion_criteria);
  const reviewGate = object(state.final_independent_review_gate);
  return Boolean(
    result.success === true &&
    text(result.status || state.status, 100).toLowerCase() === "completed" &&
    completion.complete === true &&
    completion.verified === true &&
    completion.final_diff_observed === true &&
    quality.verified === true &&
    (productCompletion.required !== true || productCompletion.verified === true) &&
    (reviewGate.required !== true || reviewGate.verified === true)
  );
}

function assessSkill(skill = {}, result = {}) {
  const state = object(result.state);
  const boundary = firstMutationBoundary(state);
  const operations = operationEntries(state);
  const areas = skillAreas(skill);
  const verifierKeys = new Set(
    list(skill.verifiers).map(verifierKey).filter(Boolean),
  );
  const checks = verifierEvidence(state).filter((entry) => verifierKeys.has(entry.key));
  const verifierPasses = checks.filter((entry) => entry.passed === true);
  const preMutationVerifierFailures = checks.filter((entry) => {
    if (entry.passed === true) return false;
    if (boundary.epoch_ms === null) return boundary.operation_index === null;
    return entry.epoch_ms !== null && entry.epoch_ms <= boundary.epoch_ms;
  });

  const successfulAreaReads = operations.filter((entry) =>
    entry.action === "read" &&
    entry.status === "completed" &&
    beforeMutation(entry, boundary) &&
    areas.some((area) => pathWithinArea(readPath(entry), area))
  );
  const failedAreaReads = operations.filter((entry) =>
    entry.action === "read" &&
    entry.status && entry.status !== "completed" &&
    beforeMutation(entry, boundary) &&
    areas.some((area) => pathWithinArea(readPath(entry), area))
  );

  const currentBase = text(state.base_commit, 160).toLowerCase();
  const sourceBases = sourceBaseCommits(skill);
  const repositoryHeadMoved = Boolean(
    currentBase && sourceBases.length && !sourceBases.includes(currentBase),
  );
  const revalidationSuccess = verifierPasses.length > 0 || successfulAreaReads.length > 0;
  const directCurrentHeadContradiction =
    preMutationVerifierFailures.length > 0 || failedAreaReads.length > 0;
  const architectureDriftSignal =
    repositoryHeadMoved && directCurrentHeadContradiction;
  const currentMissionVerified = verifiedComplete(result);

  return {
    skill_id: text(skill.skill_id, 160) || null,
    skill_type: text(skill.type, 120) || null,
    areas,
    verifier_count: verifierKeys.size,
    verifier_checks: checks.length,
    verifier_passes: verifierPasses.length,
    pre_mutation_verifier_failures: preMutationVerifierFailures.length,
    successful_pre_mutation_area_reads: successfulAreaReads.length,
    failed_pre_mutation_area_reads: failedAreaReads.length,
    current_head_revalidation_observed:
      checks.length + successfulAreaReads.length + failedAreaReads.length > 0,
    current_head_revalidation_success: revalidationSuccess,
    direct_current_head_contradiction: directCurrentHeadContradiction,
    repository_head_moved: repositoryHeadMoved,
    repository_head_movement_without_contradiction:
      repositoryHeadMoved && !directCurrentHeadContradiction,
    architecture_drift_signal: architectureDriftSignal,
    current_mission_verified_complete: currentMissionVerified,
    verified_success_with_skill_revalidation:
      currentMissionVerified && revalidationSuccess && !directCurrentHeadContradiction,
    current_base_commit: currentBase || null,
    source_base_commits: sourceBases,
    sha_movement_alone_causes_decay: false,
  };
}

function observationFingerprint({ missionId, skillId, state, assessment }) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({
      missionId,
      skillId,
      baseCommit: text(state.base_commit, 160),
      status: text(state.status, 100),
      tests: list(state.tests).length,
      verification: list(state.verification).length,
      evidence: list(state.evidence).length,
      revalidated: assessment.current_head_revalidation_success,
      contradicted: assessment.direct_current_head_contradiction,
      verified: assessment.current_mission_verified_complete,
    }), "utf8")
    .digest("hex")
    .slice(0, 40);
}

function observationMemoryKey(actor, missionId, skillId, fingerprint) {
  return `code_ai_engineering_skill_lifecycle:v1:${crypto
    .createHash("sha256")
    .update(`${actor}:${missionId}:${skillId}:${fingerprint}`, "utf8")
    .digest("hex")
    .slice(0, 40)}`;
}

async function existingObservation({ orgId, memoryKey }) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id")
    .eq("organization_id", orgId)
    .eq("memory_scope", OBSERVATION_SCOPE)
    .eq("memory_key", memoryKey)
    .limit(1);
  if (result.error) throw result.error;
  return result.data?.[0] || null;
}

function scoreRows(rows = [], skillId) {
  const latestByMission = new Map();
  for (const row of rows) {
    const metadata = object(row.metadata);
    if (text(metadata.contract, 180) !== CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT) continue;
    if (text(metadata.skill_id, 160) !== skillId) continue;
    const missionId = text(metadata.current_mission_id, 240);
    if (!missionId || latestByMission.has(missionId)) continue;
    latestByMission.set(missionId, metadata);
  }

  const observations = [...latestByMission.values()];
  let effectiveUseCount = 0;
  let revalidationSuccessCount = 0;
  let verifiedSuccessCount = 0;
  let contradictionCount = 0;
  let architectureDriftCount = 0;
  let headMovementWithoutContradictionCount = 0;

  for (const metadata of observations) {
    const assessment = object(metadata.assessment);
    if (
      assessment.current_head_revalidation_observed === true ||
      assessment.direct_current_head_contradiction === true
    ) effectiveUseCount += 1;
    if (assessment.current_head_revalidation_success === true) revalidationSuccessCount += 1;
    if (assessment.verified_success_with_skill_revalidation === true) verifiedSuccessCount += 1;
    if (assessment.direct_current_head_contradiction === true) contradictionCount += 1;
    if (assessment.architecture_drift_signal === true) architectureDriftCount += 1;
    if (assessment.repository_head_movement_without_contradiction === true) {
      headMovementWithoutContradictionCount += 1;
    }
  }

  const positive = revalidationSuccessCount + (verifiedSuccessCount * 1.5);
  const negative = (contradictionCount * 2) + (architectureDriftCount * 1.5);
  const lifecycleScore = Math.max(
    0.05,
    Math.min(0.98, (2.4 + positive) / (3.2 + positive + (2.6 * negative))),
  );
  const confidenceMultiplier = Math.max(
    0.35,
    Math.min(1.12, 0.55 + (0.6 * lifecycleScore)),
  );

  let lifecycleState = "FORMED";
  if (
    effectiveUseCount >= 2 &&
    contradictionCount >= 2 &&
    lifecycleScore < 0.35
  ) {
    lifecycleState = "SUPPRESSED";
  } else if (contradictionCount >= 1 && lifecycleScore < 0.65) {
    lifecycleState = "DECAYING";
  } else if (
    effectiveUseCount >= 3 &&
    revalidationSuccessCount >= 3 &&
    verifiedSuccessCount >= 3 &&
    contradictionCount === 0 &&
    architectureDriftCount === 0 &&
    lifecycleScore >= 0.82
  ) {
    lifecycleState = "PROMOTION_CANDIDATE";
  } else if (
    effectiveUseCount >= 2 &&
    revalidationSuccessCount >= 2 &&
    verifiedSuccessCount >= 2 &&
    contradictionCount === 0 &&
    lifecycleScore >= 0.72
  ) {
    lifecycleState = "PROVEN";
  }

  return {
    skill_id: skillId,
    observation_count: observations.length,
    effective_use_count: effectiveUseCount,
    revalidation_success_count: revalidationSuccessCount,
    verified_success_count: verifiedSuccessCount,
    direct_current_head_contradiction_count: contradictionCount,
    architecture_drift_signal_count: architectureDriftCount,
    head_movement_without_contradiction_count: headMovementWithoutContradictionCount,
    lifecycle_score: Number(lifecycleScore.toFixed(4)),
    confidence_multiplier: Number(confidenceMultiplier.toFixed(4)),
    lifecycle_state: lifecycleState,
    suppressed: lifecycleState === "SUPPRESSED",
    decaying: lifecycleState === "DECAYING",
    promotion_candidate: lifecycleState === "PROMOTION_CANDIDATE",
    sha_movement_alone_causes_decay: false,
    direct_current_head_contradiction_required_for_decay: true,
    causal_attribution_allowed: false,
    authorization_effect: "NONE",
  };
}

export async function loadCodeAIEngineeringSkillLifecycleScores({
  context = {},
  skillIds = [],
  repositoryUrl = null,
  ref = null,
} = {}) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  const ids = [...new Set(
    list(skillIds).map((item) => text(item, 160)).filter(Boolean),
  )].slice(0, 30);
  if (!orgId) throw new Error("CODE_AI_ENGINEERING_SKILL_LIFECYCLE_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("CODE_AI_ENGINEERING_SKILL_LIFECYCLE_ACTOR_REQUIRED");
  if (!ids.length) {
    return {
      contract: CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT,
      scores: {},
      authorization_effect: "NONE",
    };
  }

  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata,created_at,updated_at")
    .eq("organization_id", orgId)
    .eq("memory_scope", OBSERVATION_SCOPE)
    .contains("metadata", { actor_id: actor })
    .order("created_at", { ascending: false })
    .limit(MAX_OBSERVATION_ROWS);
  if (result.error) throw result.error;

  const repository = normalizedRepository(repositoryUrl);
  const targetRef = text(ref, 160).toLowerCase();
  const rows = (result.data || []).filter((row) => {
    const metadata = object(row.metadata);
    if (!ids.includes(text(metadata.skill_id, 160))) return false;
    if (repository && normalizedRepository(metadata.repository_url) !== repository) return false;
    if (targetRef && text(metadata.ref, 160).toLowerCase() !== targetRef) return false;
    return true;
  });

  const scores = {};
  for (const skillId of ids) scores[skillId] = scoreRows(rows, skillId);
  return {
    contract: CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT,
    scores,
    observation_rows_considered: rows.length,
    direct_current_head_contradiction_required_for_decay: true,
    sha_movement_alone_causes_decay: false,
    automatic_knowledge_promotion: false,
    authorization_effect: "NONE",
  };
}

function stableSkillSignature(skill = {}) {
  const verifierKeys = list(skill.verifiers).map(verifierKey).filter(Boolean).sort();
  return [
    text(skill.type, 120),
    skill.repair_pattern === true ? "repair" : "normal",
    normalizeArea(skill.area) || "*",
    verifierKeys.join("|"),
  ].join("::");
}

function mergeEquivalentSkills(skills = []) {
  const groups = new Map();
  for (const skill of list(skills)) {
    const signature = stableSkillSignature(skill);
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(skill);
  }

  const merged = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort((left, right) =>
      Number(right.lifecycle?.lifecycle_score || 0) - Number(left.lifecycle?.lifecycle_score || 0) ||
      Number(right.skill_rank_score || 0) - Number(left.skill_rank_score || 0)
    );
    const primary = ordered[0];
    const sourceMap = new Map();
    for (const skill of ordered) {
      for (const source of list(skill.source_missions)) {
        const missionId = text(source?.mission_id, 240);
        if (missionId && !sourceMap.has(missionId)) sourceMap.set(missionId, source);
      }
    }
    const aliases = ordered
      .map((skill) => text(skill.skill_id, 160))
      .filter((id) => id && id !== text(primary.skill_id, 160));
    merged.push({
      ...primary,
      source_missions: [...sourceMap.values()].slice(0, MAX_SOURCE_MISSIONS),
      support_count: sourceMap.size,
      topics: [...new Set(ordered.flatMap((skill) => list(skill.topics)))].slice(0, 12),
      evidence_areas: [...new Set(ordered.flatMap(skillAreas))].slice(0, MAX_AREAS),
      merged_equivalent_skill_ids: aliases,
      equivalent_skill_merge_performed: aliases.length > 0,
    });
  }
  return merged;
}

function splitOverlyBroadSkills(skills = []) {
  const output = [];
  for (const skill of list(skills)) {
    const areas = skillAreas(skill);
    if (text(skill.type, 120) !== "CROSS_AREA_VERIFIER_SKILL" || areas.length < 4) {
      output.push(skill);
      continue;
    }

    const childSources = new Map();
    for (const area of areas) childSources.set(area, []);
    for (const source of list(skill.source_missions)) {
      const sourceAreas = [...new Set(list(source?.areas).map(normalizeArea).filter(Boolean))];
      for (const area of sourceAreas) {
        if (childSources.has(area)) childSources.get(area).push(source);
      }
    }
    const eligibleChildren = [...childSources.entries()]
      .filter(([, sources]) => new Set(sources.map((source) => text(source?.mission_id, 240))).size >= 2);
    if (eligibleChildren.length < 2) {
      output.push({ ...skill, split_recommended: true, split_performed: false });
      continue;
    }

    for (const [area, sources] of eligibleChildren) {
      const uniqueSources = [];
      const seen = new Set();
      for (const source of sources) {
        const missionId = text(source?.mission_id, 240);
        if (!missionId || seen.has(missionId)) continue;
        seen.add(missionId);
        uniqueSources.push(source);
      }
      const childId = crypto
        .createHash("sha256")
        .update(`split:${text(skill.skill_id, 160)}:${area}`, "utf8")
        .digest("hex")
        .slice(0, 28);
      output.push({
        ...skill,
        skill_id: childId,
        type: "AREA_VERIFICATION_SKILL",
        title: `Verified workflow for ${area}`,
        area,
        evidence_areas: [area],
        source_missions: uniqueSources.slice(0, MAX_SOURCE_MISSIONS),
        support_count: uniqueSources.length,
        split_from_skill_id: text(skill.skill_id, 160) || null,
        split_recommended: true,
        split_performed: true,
        lifecycle_inherited_from_parent: true,
        confidence: Number((Number(skill.confidence || 0.6) * 0.92).toFixed(4)),
      });
    }
  }
  return output;
}

export async function governCodeAIEngineeringSkills({
  context = {},
  skillSet = {},
  repositoryUrl,
  ref = "main",
} = {}) {
  const source = object(skillSet);
  const skills = list(source.skills).slice(0, MAX_SKILLS);
  if (!skills.length) {
    return {
      ...source,
      lifecycle_contract: CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT,
      lifecycle_evaluated: true,
      skills: [],
      lifecycle_suppressed_count: 0,
      equivalent_skill_merge_count: 0,
      broad_skill_split_count: 0,
    };
  }

  let scores = {};
  try {
    const loaded = await loadCodeAIEngineeringSkillLifecycleScores({
      context,
      skillIds: skills.map((skill) => skill.skill_id),
      repositoryUrl,
      ref,
    });
    scores = object(loaded.scores);
  } catch (error) {
    return {
      ...source,
      lifecycle_contract: CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT,
      lifecycle_evaluated: false,
      lifecycle_failure_reason: text(error?.message || error, 500),
      skills: skills.map((skill) => ({
        ...skill,
        lifecycle: {
          lifecycle_state: "UNOBSERVED",
          lifecycle_score: null,
          confidence_multiplier: 1,
          direct_current_head_contradiction_required_for_decay: true,
          sha_movement_alone_causes_decay: false,
        },
      })),
      lifecycle_suppressed_count: 0,
      equivalent_skill_merge_count: 0,
      broad_skill_split_count: 0,
      authorization_effect: "NONE",
    };
  }

  const lifecycleApplied = skills.map((skill) => {
    const lifecycle = object(scores[text(skill.skill_id, 160)]);
    const multiplier = Number.isFinite(Number(lifecycle.confidence_multiplier))
      ? Number(lifecycle.confidence_multiplier)
      : 1;
    const adjustedConfidence = Math.max(
      0.05,
      Math.min(0.99, Number(skill.confidence || 0.5) * multiplier),
    );
    return {
      ...skill,
      lifecycle: Object.keys(lifecycle).length ? lifecycle : {
        skill_id: text(skill.skill_id, 160) || null,
        lifecycle_state: "UNOBSERVED",
        lifecycle_score: null,
        confidence_multiplier: 1,
        direct_current_head_contradiction_required_for_decay: true,
        sha_movement_alone_causes_decay: false,
      },
      confidence_before_lifecycle: Number(skill.confidence || 0),
      confidence: Number(adjustedConfidence.toFixed(4)),
      skill_rank_score_before_lifecycle: Number(skill.skill_rank_score || 0),
      skill_rank_score: Number(
        (Number(skill.skill_rank_score || 0) * Math.max(0.35, multiplier)).toFixed(4),
      ),
    };
  });

  const suppressedCount = lifecycleApplied.filter(
    (skill) => skill.lifecycle?.suppressed === true,
  ).length;
  const active = lifecycleApplied.filter((skill) => skill.lifecycle?.suppressed !== true);
  const merged = mergeEquivalentSkills(active);
  const mergeCount = merged.reduce(
    (count, skill) => count + list(skill.merged_equivalent_skill_ids).length,
    0,
  );
  const split = splitOverlyBroadSkills(merged);
  const splitCount = split.filter((skill) => skill.split_performed === true).length;
  const ranked = split
    .sort((left, right) =>
      Number(right.skill_rank_score || 0) - Number(left.skill_rank_score || 0) ||
      Number(right.support_count || 0) - Number(left.support_count || 0)
    )
    .slice(0, Math.max(1, Number(source.count || skills.length || 1)));

  return {
    ...source,
    lifecycle_contract: CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT,
    lifecycle_evaluated: true,
    skills: ranked,
    count: ranked.length,
    lifecycle_suppressed_count: suppressedCount,
    equivalent_skill_merge_count: mergeCount,
    broad_skill_split_count: splitCount,
    direct_current_head_contradiction_required_for_decay: true,
    sha_movement_alone_causes_decay: false,
    dynamic_merge_split: true,
    persisted_as_trusted_rule: false,
    automatic_knowledge_promotion: false,
    authorization_effect: "NONE",
  };
}

function promotionEligible(skill = {}, lifecycle = {}) {
  return Boolean(
    Number(skill.support_count || 0) >= 3 &&
    Number(lifecycle.effective_use_count || 0) >= 3 &&
    Number(lifecycle.revalidation_success_count || 0) >= 3 &&
    Number(lifecycle.verified_success_count || 0) >= 3 &&
    Number(lifecycle.direct_current_head_contradiction_count || 0) === 0 &&
    Number(lifecycle.architecture_drift_signal_count || 0) === 0 &&
    Number(lifecycle.lifecycle_score || 0) >= 0.82 &&
    lifecycle.lifecycle_state === "PROMOTION_CANDIDATE"
  );
}

function safeSkillCandidate(skill = {}, lifecycle = {}) {
  return {
    skill_id: text(skill.skill_id, 160) || null,
    type: text(skill.type, 120) || null,
    title: text(skill.title, 1000) || null,
    area: normalizeArea(skill.area) || null,
    evidence_areas: skillAreas(skill),
    topics: list(skill.topics).slice(0, 12).map((item) => text(item, 300)).filter(Boolean),
    verifiers: list(skill.verifiers)
      .slice(0, MAX_VERIFIERS)
      .map(verifier)
      .filter(Boolean),
    repair_pattern: skill.repair_pattern === true,
    support_count: Number(skill.support_count || 0),
    source_mission_ids: list(skill.source_missions)
      .slice(0, MAX_SOURCE_MISSIONS)
      .map((source) => text(source?.mission_id, 240))
      .filter(Boolean),
    source_base_commits: sourceBaseCommits(skill),
    confidence: Number(skill.confidence || 0),
    lifecycle: {
      effective_use_count: Number(lifecycle.effective_use_count || 0),
      revalidation_success_count: Number(lifecycle.revalidation_success_count || 0),
      verified_success_count: Number(lifecycle.verified_success_count || 0),
      direct_current_head_contradiction_count:
        Number(lifecycle.direct_current_head_contradiction_count || 0),
      architecture_drift_signal_count:
        Number(lifecycle.architecture_drift_signal_count || 0),
      lifecycle_score: Number(lifecycle.lifecycle_score || 0),
      lifecycle_state: text(lifecycle.lifecycle_state, 80) || null,
    },
  };
}

function candidateMemoryKey(skillId) {
  return `code-engineering-skill-evidence-candidate:${crypto
    .createHash("sha256")
    .update(text(skillId, 160), "utf8")
    .digest("hex")
    .slice(0, 40)}`;
}

async function writeLearningEvidenceCandidate({ skill, lifecycle, repositoryUrl, ref }) {
  const learningOrganizationId = text(process.env[LEARNING_ORGANIZATION_ENV], 160);
  if (!learningOrganizationId) {
    return {
      written: false,
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      reusable_platform_knowledge_written: false,
    };
  }
  const safe = safeSkillCandidate(skill, lifecycle);
  if (!safe.skill_id) {
    return {
      written: false,
      reason: "SKILL_ID_REQUIRED",
      reusable_platform_knowledge_written: false,
    };
  }
  const now = new Date().toISOString();
  const verifierEvidence = safe.verifiers.map(verifierText).filter(Boolean);
  const row = {
    organization_id: learningOrganizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: EVIDENCE_CANDIDATE_SCOPE,
    memory_key: candidateMemoryKey(safe.skill_id),
    memory_type: "evidence",
    subject: `Governed Code engineering skill evidence: ${safe.title || safe.skill_id}`,
    content: [
      `Repeated attested Code missions and later current-HEAD revalidation support an engineering pattern candidate: ${safe.title || safe.skill_id}.`,
      safe.area ? `Scope: ${safe.area}.` : null,
      verifierEvidence.length ? `Verifier evidence: ${verifierEvidence.join(" | ")}.` : null,
      "This remains an evidence candidate and is not reusable platform knowledge until the existing epistemic promotion and final release pipeline approves it.",
    ].filter(Boolean).join(" "),
    importance: 0.9,
    confidence: Math.max(0, Math.min(1, Number(lifecycle.lifecycle_score || 0))),
    source: OBSERVATION_SOURCE,
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: EVIDENCE_CANDIDATE_CONTRACT,
      source_contract: CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT,
      source_skill_contract: text(skill.contract, 180) || "AVANTIQO_CODE_AI_ENGINEERING_SKILL_V1",
      epistemic_state: "EVIDENCE_CANDIDATE_NOT_RELEASED",
      reusable_platform_knowledge: false,
      knowledge_router_reuse_allowed: false,
      automatic_knowledge_promotion: false,
      explicit_final_promotion_required: true,
      requires_epistemic_promotion_pipeline: true,
      next_stage_contract: "AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_V1",
      direct_platform_knowledge_write_allowed: false,
      customer_private_memory: false,
      customer_private_content_included: false,
      raw_customer_turn_included: false,
      raw_payload_included: false,
      raw_output_included: false,
      raw_reasoning_persisted: false,
      raw_source_code_included: false,
      raw_patch_included: false,
      knowledge_domain: "platform-engineering",
      jurisdiction: null,
      topic_key: `code-engineering-skill-${safe.skill_id}`,
      stability: "mutable",
      code_engineering_skill_id: safe.skill_id,
      repository_url: text(repositoryUrl, 1000) || null,
      ref: text(ref, 160) || "main",
      source_count: safe.source_mission_ids.length + Number(lifecycle.verified_success_count || 0),
      structural_code_engineering_skill_candidate: safe,
      verified_execution_evidence_present: true,
      repeated_current_head_revalidation_present: true,
      direct_current_head_contradiction_count: 0,
      architecture_drift_signal_count: 0,
      explicit_skill_lifecycle_promotion_threshold_met: true,
      automatic_training_effect: "NONE",
      automatic_model_weight_mutation: false,
      production_model_promotion_effect: "NONE",
      automatic_runpod_submission: false,
      authorization_value: "none",
      created_by: OBSERVATION_SOURCE,
      observed_at: now,
      updated_at: now,
    },
    updated_at: now,
  };

  const sealed = sealAvantiqoLearningEvidenceCandidateAuthenticity(row);
  if (sealed?.success !== true || !sealed.row) {
    return {
      written: false,
      reason: "PROMOTION_CANDIDATE_NOT_WRITTEN_AUTHENTICITY_UNAVAILABLE",
      authenticity_contract: AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_CONTRACT,
      authenticity_failure_reason: text(sealed?.reason, 300) || null,
      reusable_platform_knowledge_written: false,
    };
  }

  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(sealed.row, {
      onConflict: "organization_id,memory_scope,memory_key",
    })
    .select("id,memory_key,metadata,created_at,updated_at")
    .single();
  if (result.error) throw result.error;
  return {
    written: Boolean(result.data?.id),
    reason: result.data?.id ? "LEARNING_EVIDENCE_CANDIDATE_WRITTEN" : "NOT_WRITTEN",
    memory_scope: EVIDENCE_CANDIDATE_SCOPE,
    memory_key: sealed.row.memory_key,
    authenticity_contract: AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_CONTRACT,
    authenticity_sealed: true,
    reusable_platform_knowledge_written: false,
    automatic_knowledge_promotion: false,
    next_stage_contract: "AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_V1",
  };
}

export async function recordCodeAIEngineeringSkillLifecycleOutcome({
  context = {},
  result = {},
  allowPromotionCandidate = false,
} = {}) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  const state = object(result.state);
  const formed = object(result.formed_engineering_skills || state.formed_engineering_skills);
  const skills = list(formed.skills).slice(0, MAX_SKILLS);
  const missionId = text(state.mission_id, 240);
  if (!orgId) throw new Error("CODE_AI_ENGINEERING_SKILL_LIFECYCLE_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("CODE_AI_ENGINEERING_SKILL_LIFECYCLE_ACTOR_REQUIRED");
  if (!missionId || !skills.length) {
    return {
      contract: CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT,
      applicable: false,
      written: 0,
      observations: [],
      promotion_candidates_written: 0,
      reason: !missionId ? "CURRENT_MISSION_REQUIRED" : "NO_FORMED_ENGINEERING_SKILLS",
      authorization_effect: "NONE",
    };
  }

  const repositoryUrl = text(state.repository_url, 1000) || null;
  const ref = text(state.ref, 160) || "main";
  const now = new Date().toISOString();
  const observations = [];

  for (const skill of skills) {
    const skillId = text(skill?.skill_id, 160);
    if (!skillId) continue;
    const assessment = assessSkill(skill, result);
    const fingerprint = observationFingerprint({
      missionId,
      skillId,
      state,
      assessment,
    });
    const memoryKey = observationMemoryKey(actor, missionId, skillId, fingerprint);
    const existing = await existingObservation({ orgId, memoryKey });
    if (existing?.id) {
      observations.push({
        written: false,
        idempotent: true,
        skill_id: skillId,
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
        memory_scope: OBSERVATION_SCOPE,
        memory_key: memoryKey,
        memory_type: "fact",
        subject: "Code AI Engineering Skill Lifecycle Observation",
        content: `Observed future-use evidence for engineering skill ${skillId} in Code mission ${missionId}.`,
        importance: 0.04,
        confidence: assessment.direct_current_head_contradiction ? 1 : 0.9,
        source: OBSERVATION_SOURCE,
        active: true,
        metadata: {
          contract: CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT,
          actor_id: actor,
          current_mission_id: missionId,
          skill_id: skillId,
          skill_type: text(skill.type, 120) || null,
          repository_url: repositoryUrl,
          ref,
          current_base_commit: text(state.base_commit, 160) || null,
          observation_fingerprint: fingerprint,
          observed_at: now,
          assessment,
          relationship: "OBSERVATIONAL_SKILL_UTILITY_ONLY",
          causal_attribution_allowed: false,
          direct_current_head_contradiction_required_for_decay: true,
          sha_movement_alone_causes_decay: false,
          automatic_knowledge_promotion: false,
          ordinary_memory_recall: false,
          authorization_effect: "NONE",
          commit_authority: false,
          production_deploy_authority: false,
        },
        updated_at: now,
      })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;
    observations.push({
      written: Boolean(inserted.data?.id),
      idempotent: false,
      skill_id: skillId,
      assessment,
    });
  }

  let scores = {};
  if (observations.length) {
    const loaded = await loadCodeAIEngineeringSkillLifecycleScores({
      context,
      skillIds: skills.map((skill) => skill.skill_id),
      repositoryUrl,
      ref,
    });
    scores = object(loaded.scores);
  }

  const promotionReceipts = [];
  if (allowPromotionCandidate === true && verifiedComplete(result)) {
    for (const skill of skills) {
      const lifecycle = object(scores[text(skill.skill_id, 160)]);
      if (!promotionEligible(skill, lifecycle)) continue;
      try {
        const receipt = await writeLearningEvidenceCandidate({
          skill,
          lifecycle,
          repositoryUrl,
          ref,
        });
        promotionReceipts.push({
          skill_id: text(skill.skill_id, 160),
          ...receipt,
        });
      } catch (error) {
        promotionReceipts.push({
          skill_id: text(skill.skill_id, 160),
          written: false,
          reason: "LEARNING_EVIDENCE_CANDIDATE_WRITE_FAILED",
          failure_reason: text(error?.message || error, 500),
          reusable_platform_knowledge_written: false,
        });
      }
    }
  }

  return {
    contract: CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT,
    applicable: observations.length > 0,
    written: observations.filter((entry) => entry.written).length,
    observations,
    scores,
    promotion_evaluated: allowPromotionCandidate === true && verifiedComplete(result),
    promotion_candidates_written:
      promotionReceipts.filter((entry) => entry.written === true).length,
    promotion_receipts: promotionReceipts,
    direct_current_head_contradiction_required_for_decay: true,
    sha_movement_alone_causes_decay: false,
    evidence_candidate_authenticity_required: true,
    direct_platform_knowledge_write_allowed: false,
    reusable_platform_knowledge_written: false,
    automatic_knowledge_promotion: false,
    causal_attribution_allowed: false,
    authorization_effect: "NONE",
  };
}

export const CodeAIEngineeringSkillLifecycleRuntime = Object.freeze({
  contract: CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT,
  record: recordCodeAIEngineeringSkillLifecycleOutcome,
  loadScores: loadCodeAIEngineeringSkillLifecycleScores,
  govern: governCodeAIEngineeringSkills,
  direct_current_head_contradiction_required_for_decay: true,
  sha_movement_alone_causes_decay: false,
  dynamic_merge_split: true,
  evidence_candidate_authenticity_required: true,
  direct_platform_knowledge_write_allowed: false,
  automatic_knowledge_promotion: false,
  authorization_effect: "NONE",
});

export default CodeAIEngineeringSkillLifecycleRuntime;
