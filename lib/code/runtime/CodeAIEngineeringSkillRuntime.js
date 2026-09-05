import crypto from "node:crypto";

import {
  listCodeAIMissionHistory,
  loadCodeAIMissionHistoryDetail,
} from "@/lib/code/runtime/CodeAIMissionHistoryRuntime";
import {
  loadCodeAIEngineeringMemoryUtilityScores,
  CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT,
} from "@/lib/code/runtime/CodeAIEngineeringMemoryUtilityRuntime";

export const CODE_AI_ENGINEERING_SKILL_CONTRACT =
  "AVANTIQO_CODE_AI_ENGINEERING_SKILL_V1";

const MIN_SUPPORT = 2;
const MAX_HISTORY = 40;
const MAX_DETAIL_LOADS = 16;
const MAX_SKILLS = 6;
const MAX_SOURCE_MISSIONS = 8;
const MAX_VERIFIERS = 6;
const STOP_WORDS = new Set([
  "about", "after", "again", "against", "also", "and", "are", "build", "code",
  "continue", "from", "into", "make", "mission", "more", "next", "our", "same",
  "system", "that", "the", "their", "then", "this", "through", "with", "work",
]);

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizedRepository(value) {
  return text(value, 1000)
    .toLowerCase()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
}

function tokens(value) {
  return [...new Set(
    text(value, 5000)
      .toLowerCase()
      .split(/[^a-z0-9_./@+-]+/g)
      .map((item) => item.trim())
      .filter((item) => item.length >= 3 && !STOP_WORDS.has(item)),
  )].slice(0, 40);
}

function stableArea(path) {
  const normalized = text(path, 1000).replace(/^\/+/, "");
  if (!normalized) return null;
  const segments = normalized.split("/").filter(Boolean);
  if (!segments.length) return null;
  if (segments[0] === "app" && segments[1] === "api") {
    return segments.slice(0, Math.min(4, segments.length)).join("/");
  }
  if (segments[0] === "lib") {
    return segments.slice(0, Math.min(3, segments.length)).join("/");
  }
  if (segments[0] === "components") {
    return segments.slice(0, Math.min(2, segments.length)).join("/");
  }
  if (segments[0] === "supabase") {
    return segments.slice(0, Math.min(2, segments.length)).join("/");
  }
  if (segments[0] === "app") {
    return segments.slice(0, Math.min(4, segments.length)).join("/");
  }
  if (["tests", "scripts", "docs"].includes(segments[0])) {
    return segments.slice(0, Math.min(2, segments.length)).join("/");
  }
  return segments.slice(0, Math.min(2, segments.length)).join("/");
}

function verifier(entry = {}) {
  const command = text(entry.command, 300);
  const args = list(entry.args).slice(0, 16).map((arg) => text(arg, 500)).filter(Boolean);
  if (!command) return null;
  return { command, args };
}

function verifierKey(entry = {}) {
  const normalized = verifier(entry);
  if (!normalized) return null;
  return [normalized.command, ...normalized.args].join("\u0000");
}

function verifierText(entry = {}) {
  const normalized = verifier(entry);
  return normalized ? [normalized.command, ...normalized.args].join(" ") : "";
}

function distinctByMission(entries = []) {
  const seen = new Set();
  const output = [];
  for (const entry of entries) {
    const missionId = text(entry?.session?.mission_id, 240);
    if (!missionId || seen.has(missionId)) continue;
    seen.add(missionId);
    output.push(entry);
  }
  return output;
}

function utilityEligible(utility = {}) {
  const source = object(utility);
  return Boolean(
    Number(source.observation_count || 0) >= 1 &&
    Number(source.validation_success_count || 0) >= 1 &&
    Number(source.stale_signal_count || 0) === 0 &&
    Number(source.contradiction_signal_count || 0) === 0 &&
    source.suppressed !== true &&
    Number(source.utility_score || 0) >= 0.45
  );
}

function averageUtility(entries = []) {
  const values = entries
    .map((entry) => Number(entry.utility?.utility_score))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));
}

function sharedTopics(entries = []) {
  const frequency = new Map();
  for (const entry of entries) {
    for (const token of tokens(entry.session?.objective)) {
      frequency.set(token, (frequency.get(token) || 0) + 1);
    }
  }
  return [...frequency.entries()]
    .filter(([, count]) => count >= MIN_SUPPORT)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([token]) => token);
}

function objectiveRelevance(goal, skill) {
  const goalTokens = new Set(tokens(goal));
  if (!goalTokens.size) return 0;
  const evidenceTokens = new Set([
    ...tokens(skill.area),
    ...list(skill.topics),
    ...list(skill.verifiers).flatMap((item) => tokens(verifierText(item))),
  ]);
  let overlap = 0;
  for (const token of goalTokens) if (evidenceTokens.has(token)) overlap += 1;
  return Math.min(20, overlap * 4);
}

function skillId(type, key) {
  return crypto
    .createHash("sha256")
    .update(`${type}:${key}`, "utf8")
    .digest("hex")
    .slice(0, 28);
}

function sourceProjection(entries = []) {
  return distinctByMission(entries)
    .slice(0, MAX_SOURCE_MISSIONS)
    .map((entry) => ({
      mission_id: text(entry.session?.mission_id, 240) || null,
      objective: text(entry.session?.objective, 1000) || null,
      base_commit: text(entry.session?.base_commit, 160) || null,
      areas: [...new Set(
        list(entry.detail?.files_changed).map(stableArea).filter(Boolean),
      )].slice(0, 12),
      utility_score: Number(entry.utility?.utility_score || 0),
      validation_success_count: Number(entry.utility?.validation_success_count || 0),
      useful_completion_count: Number(entry.utility?.useful_completion_count || 0),
    }));
}

function baseSkill({ type, key, title, area = null, entries = [], verifiers = [], repair = false }) {
  const sources = distinctByMission(entries);
  const supportCount = sources.length;
  const utility = averageUtility(sources);
  const evidenceAreas = [...new Set(
    sources.flatMap((entry) => list(entry.detail?.files_changed).map(stableArea).filter(Boolean)),
  )].slice(0, 16);
  const confidence = Math.min(
    0.98,
    0.55 + Math.min(0.2, (supportCount - MIN_SUPPORT) * 0.05) + ((utility || 0.5) * 0.2),
  );
  return {
    contract: CODE_AI_ENGINEERING_SKILL_CONTRACT,
    skill_id: skillId(type, key),
    type,
    title,
    area,
    evidence_areas: evidenceAreas,
    topics: sharedTopics(sources),
    support_count: supportCount,
    source_missions: sourceProjection(sources),
    verifiers: list(verifiers).slice(0, MAX_VERIFIERS),
    repair_pattern: repair === true,
    average_utility_score: utility,
    confidence: Number(confidence.toFixed(4)),
    evidence_threshold_met: supportCount >= MIN_SUPPORT,
    source_area_provenance_preserved: true,
    source_missions_verified_complete: true,
    source_missions_integrity_verified: true,
    positive_current_head_utility_required: true,
    current_head_revalidation_required: true,
    patch_replay_allowed: false,
    raw_patch_returned: false,
    automatic_knowledge_promotion: false,
    trusted_rule_created: false,
    authorization_effect: "NONE",
    commit_authority: false,
    production_deploy_authority: false,
  };
}

function formAreaSkills(entries = []) {
  const areaMap = new Map();
  for (const entry of entries) {
    const areas = [...new Set(
      list(entry.detail?.files_changed).map(stableArea).filter(Boolean),
    )];
    for (const area of areas) {
      if (!areaMap.has(area)) areaMap.set(area, []);
      areaMap.get(area).push(entry);
    }
  }

  const skills = [];
  for (const [area, rawEntries] of areaMap.entries()) {
    const supported = distinctByMission(rawEntries);
    if (supported.length < MIN_SUPPORT) continue;
    const verifierFrequency = new Map();
    const verifierExamples = new Map();
    for (const entry of supported) {
      const seenThisMission = new Set();
      for (const candidate of list(entry.detail?.successful_verifiers)) {
        const key = verifierKey(candidate);
        if (!key || seenThisMission.has(key)) continue;
        seenThisMission.add(key);
        verifierFrequency.set(key, (verifierFrequency.get(key) || 0) + 1);
        if (!verifierExamples.has(key)) verifierExamples.set(key, verifier(candidate));
      }
    }
    const commonVerifierKeys = [...verifierFrequency.entries()]
      .filter(([, count]) => count >= MIN_SUPPORT)
      .sort((left, right) => right[1] - left[1])
      .slice(0, MAX_VERIFIERS)
      .map(([key]) => key);
    if (!commonVerifierKeys.length) continue;
    const verifiers = commonVerifierKeys.map((key) => verifierExamples.get(key)).filter(Boolean);
    skills.push(baseSkill({
      type: "AREA_VERIFICATION_SKILL",
      key: `${area}:${commonVerifierKeys.join("|")}`,
      title: `Verified workflow for ${area}`,
      area,
      entries: supported,
      verifiers,
    }));
  }
  return skills;
}

function formVerifierSkills(entries = []) {
  const verifierMap = new Map();
  const examples = new Map();
  for (const entry of entries) {
    const seenThisMission = new Set();
    for (const candidate of list(entry.detail?.successful_verifiers)) {
      const key = verifierKey(candidate);
      if (!key || seenThisMission.has(key)) continue;
      seenThisMission.add(key);
      if (!verifierMap.has(key)) verifierMap.set(key, []);
      verifierMap.get(key).push(entry);
      if (!examples.has(key)) examples.set(key, verifier(candidate));
    }
  }
  const skills = [];
  for (const [key, rawEntries] of verifierMap.entries()) {
    const supported = distinctByMission(rawEntries);
    const areas = new Set(
      supported.flatMap((entry) => list(entry.detail?.files_changed).map(stableArea).filter(Boolean)),
    );
    if (supported.length < 3 || areas.size < 2) continue;
    const example = examples.get(key);
    skills.push(baseSkill({
      type: "CROSS_AREA_VERIFIER_SKILL",
      key,
      title: `Repository verifier: ${verifierText(example)}`,
      area: null,
      entries: supported,
      verifiers: [example],
    }));
  }
  return skills;
}

function formRepairSkills(entries = []) {
  const repairMap = new Map();
  const examples = new Map();
  for (const entry of entries) {
    const seenThisMission = new Set();
    for (const candidate of list(entry.detail?.repaired_verifiers)) {
      if (candidate?.repaired !== true) continue;
      const key = verifierKey(candidate);
      if (!key || seenThisMission.has(key)) continue;
      seenThisMission.add(key);
      if (!repairMap.has(key)) repairMap.set(key, []);
      repairMap.get(key).push(entry);
      if (!examples.has(key)) examples.set(key, verifier(candidate));
    }
  }
  const skills = [];
  for (const [key, rawEntries] of repairMap.entries()) {
    const supported = distinctByMission(rawEntries);
    if (supported.length < MIN_SUPPORT) continue;
    const example = examples.get(key);
    skills.push(baseSkill({
      type: "REPAIR_RECOVERY_SKILL",
      key,
      title: `Verified repair loop: ${verifierText(example)}`,
      area: null,
      entries: supported,
      verifiers: [example],
      repair: true,
    }));
  }
  return skills;
}

function rankSkills(skills = [], objective = null) {
  return list(skills)
    .map((skill) => {
      const relevance = objectiveRelevance(objective, skill);
      const supportScore = Math.min(24, Number(skill.support_count || 0) * 5);
      const utilityScore = Math.round(Number(skill.average_utility_score || 0) * 20);
      const repairBonus = skill.repair_pattern === true ? 4 : 0;
      return {
        ...skill,
        objective_relevance_score: relevance,
        skill_rank_score: relevance + supportScore + utilityScore + repairBonus,
      };
    })
    .sort((left, right) =>
      right.skill_rank_score - left.skill_rank_score ||
      right.support_count - left.support_count ||
      String(left.skill_id).localeCompare(String(right.skill_id))
    );
}

async function loadEligibleEvidence({ context, repositoryUrl, ref }) {
  const history = await listCodeAIMissionHistory({
    context,
    limit: MAX_HISTORY,
    verifiedOnly: true,
    repositoryUrl,
    ref,
  });
  const sessions = list(history.sessions)
    .filter((session) => session.verified_complete === true && session.integrity_verified === true)
    .filter((session) =>
      normalizedRepository(session.repository_url) === normalizedRepository(repositoryUrl)
    );
  const missionIds = sessions.map((session) => text(session.mission_id, 240)).filter(Boolean);
  let scores = {};
  try {
    const utility = await loadCodeAIEngineeringMemoryUtilityScores({
      context,
      sourceMissionIds: missionIds,
      repositoryUrl,
      ref,
    });
    scores = object(utility.scores);
  } catch (error) {
    return {
      history_contract: history.contract || null,
      sessions_considered: sessions.length,
      eligible: [],
      utility_available: false,
      utility_error: text(error?.message || error, 500) || null,
    };
  }

  const eligibleSessions = sessions
    .map((session) => ({
      session,
      utility: object(scores[text(session.mission_id, 240)]),
    }))
    .filter((entry) => utilityEligible(entry.utility))
    .slice(0, MAX_DETAIL_LOADS);
  const eligible = [];
  for (const entry of eligibleSessions) {
    const detail = await loadCodeAIMissionHistoryDetail({
      context,
      missionId: entry.session.mission_id,
    });
    if (!detail?.found || detail.session?.verified_complete !== true) continue;
    eligible.push({
      ...entry,
      detail: detail.session,
    });
  }
  return {
    history_contract: history.contract || null,
    sessions_considered: sessions.length,
    eligible,
    utility_available: true,
    utility_error: null,
  };
}

export async function deriveCodeAIEngineeringSkills({
  context = {},
  objective = null,
  repositoryUrl,
  ref = "main",
  limit = MAX_SKILLS,
} = {}) {
  const repository = text(repositoryUrl, 1000);
  if (!repository) {
    return {
      contract: CODE_AI_ENGINEERING_SKILL_CONTRACT,
      evaluated: false,
      skills: [],
      count: 0,
      reason: "REPOSITORY_REQUIRED",
      authorization_effect: "NONE",
    };
  }

  const evidence = await loadEligibleEvidence({ context, repositoryUrl: repository, ref });
  if (!evidence.utility_available) {
    return {
      contract: CODE_AI_ENGINEERING_SKILL_CONTRACT,
      evaluated: false,
      skills: [],
      count: 0,
      reason: "UTILITY_EVIDENCE_UNAVAILABLE",
      failure_reason: evidence.utility_error,
      sessions_considered: evidence.sessions_considered,
      authorization_effect: "NONE",
    };
  }

  const formed = [
    ...formAreaSkills(evidence.eligible),
    ...formVerifierSkills(evidence.eligible),
    ...formRepairSkills(evidence.eligible),
  ];
  const deduped = [];
  const seen = new Set();
  for (const skill of formed) {
    if (seen.has(skill.skill_id)) continue;
    seen.add(skill.skill_id);
    deduped.push(skill);
  }
  const ranked = rankSkills(deduped, objective)
    .slice(0, Math.min(MAX_SKILLS, Math.max(1, Number(limit || MAX_SKILLS))));

  return {
    contract: CODE_AI_ENGINEERING_SKILL_CONTRACT,
    evaluated: true,
    skills: ranked,
    count: ranked.length,
    sessions_considered: evidence.sessions_considered,
    positive_utility_sessions: evidence.eligible.length,
    minimum_distinct_verified_missions: MIN_SUPPORT,
    skill_types: [
      "AREA_VERIFICATION_SKILL",
      "CROSS_AREA_VERIFIER_SKILL",
      "REPAIR_RECOVERY_SKILL",
    ],
    utility_contract: CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT,
    source_area_provenance_preserved: true,
    dynamic_derivation: true,
    persisted_as_trusted_rule: false,
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

export function formatCodeAIEngineeringSkillsForObjective(value = {}) {
  const skills = list(value.skills).slice(0, 4);
  if (!skills.length) return "";
  const lines = [
    "FORMED ENGINEERING SKILLS (DYNAMIC, NON-AUTHORITATIVE):",
    "These patterns were derived from multiple attested, fully verified prior missions that also survived later current-HEAD utility checks. They are not permanent rules. Validate the relevant current paths before use and rerun every cited verifier. Never replay historical patches.",
  ];
  for (const skill of skills) {
    lines.push(
      `- ${skill.title} [${skill.type}] support=${skill.support_count}; confidence=${skill.confidence}; utility=${skill.average_utility_score ?? "unknown"}`,
    );
    if (skill.area) lines.push(`  scope lead: ${skill.area}`);
    if (skill.evidence_areas?.length) {
      lines.push(`  evidence areas: ${skill.evidence_areas.join(", ")}`);
    }
    if (skill.topics?.length) lines.push(`  repeated topics: ${skill.topics.join(", ")}`);
    if (skill.verifiers?.length) {
      lines.push(`  verifier evidence: ${skill.verifiers.map(verifierText).join(" | ")}`);
    }
    lines.push(
      `  evidence missions: ${skill.source_missions.map((source) => source.mission_id).filter(Boolean).join(", ")}`,
    );
  }
  lines.push(
    "Use a formed skill only as a search/workflow accelerator. Current repository evidence, current requirements, and fresh deterministic verification remain authoritative.",
  );
  return lines.join("\n");
}

export const CodeAIEngineeringSkillRuntime = Object.freeze({
  contract: CODE_AI_ENGINEERING_SKILL_CONTRACT,
  derive: deriveCodeAIEngineeringSkills,
  formatForObjective: formatCodeAIEngineeringSkillsForObjective,
  dynamic_derivation: true,
  minimum_distinct_verified_missions: MIN_SUPPORT,
  positive_current_head_utility_required: true,
  source_area_provenance_preserved: true,
  persisted_as_trusted_rule: false,
  current_head_revalidation_required: true,
  patch_replay_allowed: false,
  authorization_effect: "NONE",
});

export default CodeAIEngineeringSkillRuntime;
