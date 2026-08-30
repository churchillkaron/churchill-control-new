import { createHash } from "node:crypto";

import {
  assessCodeAIWorldClassQuality,
} from "./CodeAIWorldClassQualityPolicy.js";

export const CODE_AI_FINAL_INDEPENDENT_REVIEW_CONTRACT =
  "AVANTIQO_CODE_AI_FINAL_INDEPENDENT_REVIEW_V1";

const MAX_PATCH_CHARS = 32000;
const MAX_SOURCE_CHANGE_CHARS = 22000;
const MAX_REVIEW_OUTPUT_CHARS = 8000;
const REVIEW_ROLES = Object.freeze([
  {
    id: "semantic_integration",
    execution_lane: "deep",
    max_output_tokens: 2200,
    mandate:
      "Review the finished patch as a senior systems engineer. Check whether it actually satisfies the owner intent, preserves repository contracts and callers, handles failure semantics, and chose a maintainable architecture. Focus on semantic defects that deterministic tests may miss.",
  },
  {
    id: "adversarial_regression",
    execution_lane: "fast",
    max_output_tokens: 1800,
    mandate:
      "Attack the finished patch as an adversarial regression reviewer. Look for security, authorization, compatibility, data-integrity, race, lifecycle, edge-case, rollback, and verification blind spots. Do not invent findings without evidence and do not nitpick style.",
  },
]);

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

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function normalizedRisk(value) {
  const risk = text(value, 80).toLowerCase();
  return ["critical", "high", "standard", "none"].includes(risk) ? risk : "none";
}

export function codeAIFinalIndependentReviewRequiredForRisk(risk) {
  return ["critical", "high"].includes(normalizedRisk(risk));
}

function requiredApprovalsForRisk(risk) {
  if (normalizedRisk(risk) === "critical") return 2;
  if (normalizedRisk(risk) === "high") return 1;
  return 0;
}

function verificationFingerprintEvidence(state = {}) {
  return list(state?.tests)
    .filter((entry) => Number.isFinite(Number(entry?.exit_code)))
    .slice(-12)
    .map((entry) => ({
      operation_id: text(entry?.operation_id, 200) || null,
      command: text(entry?.command, 300) || null,
      args: list(entry?.args).slice(0, 24).map((item) => text(item, 500)),
      exit_code: Number(entry.exit_code),
    }));
}

export function codeAIFinalIndependentReviewFingerprint(state = {}, quality = null) {
  const worldClass = quality || assessCodeAIWorldClassQuality(state);
  return sha256(stableJson({
    base_commit: text(state?.base_commit, 160) || null,
    patch_sha256: sha256(String(state?.patch ?? "")),
    files_changed: unique(list(state?.files_changed)).sort(),
    quality_contract: text(worldClass?.contract, 160) || null,
    quality_risk: normalizedRisk(worldClass?.risk),
    verification: verificationFingerprintEvidence(state),
  }));
}

export function assessCodeAIFinalIndependentReviewGate(state = {}, quality = null) {
  const worldClass = quality || assessCodeAIWorldClassQuality(state);
  const risk = normalizedRisk(worldClass?.risk);
  const required = codeAIFinalIndependentReviewRequiredForRisk(risk);
  const requiredApprovals = requiredApprovalsForRisk(risk);
  const review = object(state?.final_independent_review);
  const expectedFingerprint = codeAIFinalIndependentReviewFingerprint(state, worldClass);
  if (!required) {
    return {
      contract: CODE_AI_FINAL_INDEPENDENT_REVIEW_CONTRACT,
      required: false,
      risk,
      verified: true,
      required_approvals: 0,
      observed_approvals: 0,
      fingerprint_matches: true,
      blocker: null,
    };
  }

  const contractValid = text(review.contract, 160) === CODE_AI_FINAL_INDEPENDENT_REVIEW_CONTRACT;
  const fingerprintMatches =
    contractValid && text(review.fingerprint, 160) === expectedFingerprint;
  const observedApprovals = Number(review.approved_review_count || 0);
  const blockingFindings = Number(review.blocking_finding_count || 0);
  const verified = Boolean(
    contractValid &&
    fingerprintMatches &&
    review.verified === true &&
    blockingFindings === 0 &&
    Number.isFinite(observedApprovals) &&
    observedApprovals >= requiredApprovals
  );
  let blocker = null;
  if (!contractValid) blocker = "CODE_AI_FINAL_INDEPENDENT_REVIEW_REQUIRED";
  else if (!fingerprintMatches) blocker = "CODE_AI_FINAL_INDEPENDENT_REVIEW_STALE";
  else if (blockingFindings > 0) blocker = "CODE_AI_FINAL_INDEPENDENT_REVIEW_REPAIR_REQUIRED";
  else if (review.status === "UNAVAILABLE" || observedApprovals < requiredApprovals) {
    blocker = "CODE_AI_FINAL_INDEPENDENT_REVIEW_UNAVAILABLE";
  } else if (!verified) blocker = "CODE_AI_FINAL_INDEPENDENT_REVIEW_NOT_VERIFIED";

  return {
    contract: CODE_AI_FINAL_INDEPENDENT_REVIEW_CONTRACT,
    required: true,
    risk,
    verified,
    required_approvals: requiredApprovals,
    observed_approvals: Number.isFinite(observedApprovals) ? observedApprovals : 0,
    blocking_finding_count: Number.isFinite(blockingFindings) ? blockingFindings : 0,
    fingerprint_matches: fingerprintMatches,
    expected_fingerprint: expectedFingerprint,
    observed_fingerprint: text(review.fingerprint, 160) || null,
    review_status: text(review.status, 80) || null,
    blocker,
  };
}

function parseJsonObject(value) {
  let raw = text(value, MAX_REVIEW_OUTPUT_CHARS);
  const fence = String.fromCharCode(96).repeat(3);
  if (raw.startsWith(fence)) raw = raw.slice(fence.length).replace(/^json\s*/i, "");
  if (raw.endsWith(fence)) raw = raw.slice(0, -fence.length).trim();
  try {
    return object(JSON.parse(raw));
  } catch {
    // Continue only with extraction of one already-valid JSON object.
  }
  const candidates = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
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
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) candidates.push(parsed);
    } catch {
      // Never repair malformed reviewer output.
    }
    start = -1;
  }
  return candidates.length === 1 ? object(candidates[0]) : {};
}

function compactSourceChanges(state = {}) {
  let used = 0;
  const result = [];
  for (const candidate of list(state?.source_changes).slice(-20)) {
    const change = object(candidate);
    const path = text(change.path, 1000);
    if (!path) continue;
    const operation = text(change.operation, 40).toLowerCase() || "write";
    const remaining = Math.max(0, MAX_SOURCE_CHANGE_CHARS - used);
    if (remaining <= 0) break;
    const content = operation === "delete"
      ? null
      : String(change.content ?? "").slice(0, Math.min(5000, remaining));
    used += String(content ?? "").length;
    result.push({ path, operation, content });
  }
  return result;
}

function compactFinalEvidence(state = {}, quality = {}) {
  const patchRaw = String(state?.patch ?? "");
  return {
    base_commit: text(state?.base_commit, 160) || null,
    files_changed: unique(list(state?.files_changed)).slice(0, 80),
    patch: patchRaw.slice(0, MAX_PATCH_CHARS),
    patch_truncated: patchRaw.length > MAX_PATCH_CHARS,
    patch_bytes_observed: patchRaw.length,
    source_changes: compactSourceChanges(state),
    verification: verificationFingerprintEvidence(state),
    worldclass_quality: {
      contract: text(quality?.contract, 160) || null,
      verified: quality?.verified === true,
      risk: normalizedRisk(quality?.risk),
      required_verification_gates: Number(quality?.required_verification_gates || 0),
      fresh_verification_family_count: Number(quality?.fresh_verification_family_count || 0),
      fresh_verification_families: list(quality?.fresh_verification_families).slice(0, 12),
      adversarial_diff_review_verified: quality?.adversarial_diff_review?.verified === true,
      blockers: list(quality?.blockers).slice(0, 12),
    },
    product_completion_criteria: object(state?.product_completion_criteria),
  };
}

function reviewerPrompt({ role, objective, state, quality }) {
  return [
    "You are an independent final-patch reviewer inside Avantiqo Code. The implementation is already finished and deterministic verification has already run. You have no tools, no source mutation authority, and no deployment/migration/credential authority.",
    `FINAL REVIEW ROLE: ${role.id}. ${role.mandate}`,
    `OWNER INTENT: ${text(objective, 6000)}`,
    `FINISHED PATCH AND VERIFICATION EVIDENCE: ${JSON.stringify(compactFinalEvidence(state, quality))}`,
    "Return exactly one JSON object with keys: verdict (approve|repair_required|unable_to_verify), summary (string), findings (array of objects with severity critical|high|medium|low, title, evidence, repair), verification_gaps (array of short strings), confidence (number 0..1).",
    "Use repair_required only for a material correctness, security, compatibility, data-integrity, reliability, lifecycle or owner-intent defect. Do not block on style preferences or speculative issues without patch evidence. Give conclusions, not private chain-of-thought.",
    "Deterministic tests and repository evidence remain authoritative. You cannot waive failed verification and you cannot authorize execution.",
  ].join("\n\n");
}

function normalizeFinding(value) {
  const source = object(value);
  const severity = text(source.severity, 40).toLowerCase();
  return {
    severity: ["critical", "high", "medium", "low"].includes(severity) ? severity : "medium",
    title: text(source.title, 500) || "Reviewer finding",
    evidence: text(source.evidence, 1400) || null,
    repair: text(source.repair, 1400) || null,
  };
}

function normalizeReview(role, result) {
  const rawText = text(result?.text, MAX_REVIEW_OUTPUT_CHARS);
  const parsed = parseJsonObject(rawText);
  const verdict = text(parsed.verdict, 60).toLowerCase();
  const validVerdict = ["approve", "repair_required", "unable_to_verify"].includes(verdict);
  const findings = list(parsed.findings).map(normalizeFinding).slice(0, 16);
  const confidence = Number(parsed.confidence);
  const blockingFindings = findings.filter((finding) =>
    finding.severity === "critical" || finding.severity === "high"
  );
  return {
    role: role.id,
    execution_lane: role.execution_lane,
    success: result?.success === true && Boolean(rawText) && validVerdict,
    verdict: validVerdict ? verdict : "unable_to_verify",
    approved: result?.success === true && validVerdict && verdict === "approve" && blockingFindings.length === 0,
    summary: text(parsed.summary, 1800) || rawText.slice(0, 1800) || null,
    findings,
    blocking_finding_count: blockingFindings.length,
    verification_gaps: unique(list(parsed.verification_gaps)).slice(0, 12),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
    provider: text(result?.provider, 160) || null,
    model: text(result?.model, 240) || null,
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
    verdict: "unable_to_verify",
    approved: false,
    failure_reason: text(error?.message || error, 700) || "FINAL_REVIEW_FAILED",
    summary: null,
    findings: [],
    blocking_finding_count: 0,
    verification_gaps: [],
    confidence: null,
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

export async function runCodeAIFinalIndependentReview({
  context = {},
  objective,
  state = {},
  existing = null,
  dependencies = {},
} = {}) {
  const quality = assessCodeAIWorldClassQuality(state);
  const risk = normalizedRisk(quality.risk);
  const required = codeAIFinalIndependentReviewRequiredForRisk(risk);
  const requiredApprovals = requiredApprovalsForRisk(risk);
  const fingerprint = codeAIFinalIndependentReviewFingerprint(state, quality);
  if (!required) {
    return {
      contract: CODE_AI_FINAL_INDEPENDENT_REVIEW_CONTRACT,
      status: "NOT_REQUIRED",
      required: false,
      verified: true,
      risk,
      fingerprint,
      required_approvals: 0,
      approved_review_count: 0,
      blocking_finding_count: 0,
      reviews: [],
      concurrent_dispatch: false,
      specialist_reasoning_calls_requested: 0,
      source_mutation_authority: false,
      authorization_effect: "NONE",
      raw_reasoning_persisted: false,
    };
  }
  if (quality.verified !== true || text(state?.status, 100) !== "completed") {
    return {
      contract: CODE_AI_FINAL_INDEPENDENT_REVIEW_CONTRACT,
      status: "WAITING_FOR_VERIFIED_IMPLEMENTATION",
      required: true,
      verified: false,
      risk,
      fingerprint,
      required_approvals: requiredApprovals,
      approved_review_count: 0,
      blocking_finding_count: 0,
      reviews: [],
      concurrent_dispatch: false,
      specialist_reasoning_calls_requested: 0,
      source_mutation_authority: false,
      authorization_effect: "NONE",
      raw_reasoning_persisted: false,
    };
  }
  const reusable = object(existing);
  if (
    reusable.contract === CODE_AI_FINAL_INDEPENDENT_REVIEW_CONTRACT &&
    reusable.verified === true &&
    text(reusable.fingerprint, 160) === fingerprint
  ) {
    return {
      ...reusable,
      reused_from_attested_resume_state: true,
      specialist_reasoning_calls_requested: 0,
    };
  }

  const organizationId = text(context?.organizationId || context?.organization_id, 240);
  if (!organizationId) throw new Error("CODE_AI_FINAL_INDEPENDENT_REVIEW_ORGANIZATION_REQUIRED");
  const runReasoning = typeof dependencies.runReasoning === "function"
    ? dependencies.runReasoning
    : defaultRunReasoning;
  const partyId = text(context?.metadata?.partyId || context?.partyId || context?.party_id, 240) || null;
  const entityId = text(context?.entityId || context?.entity_id, 240) || null;
  const goal = text(objective || state?.employee_mission?.owner_intent || state?.objective, 6000);
  const startedAt = Date.now();
  const settled = await Promise.allSettled(REVIEW_ROLES.map((role) => runReasoning({
    organization_id: organizationId,
    party_id: partyId,
    entity_id: entityId,
    input: reviewerPrompt({ role, objective: goal, state, quality }),
    tools: [],
    authorization: {},
    metadata: {
      module: "CODE_AI_FINAL_INDEPENDENT_REVIEW",
      operation: role.id,
      code_ai_final_review_contract: CODE_AI_FINAL_INDEPENDENT_REVIEW_CONTRACT,
      code_ai_final_review_role: role.id,
      source_mutation_authority: false,
      execution_effect: "REVIEW_ONLY",
    },
    execution_lane: role.execution_lane,
    temperature: 0.1,
    max_output_tokens: role.max_output_tokens,
    max_turns: 1,
    max_tool_calls: 1,
  }))));
  const reviews = settled.map((entry, index) => entry.status === "fulfilled"
    ? normalizeReview(REVIEW_ROLES[index], entry.value)
    : failedReview(REVIEW_ROLES[index], entry.reason));
  const approved = reviews.filter((review) => review.approved === true).length;
  const succeeded = reviews.filter((review) => review.success === true).length;
  const blockingFindingCount = reviews.reduce(
    (sum, review) => sum + Number(review.blocking_finding_count || 0),
    0,
  );
  const repairVerdicts = reviews.filter((review) => review.verdict === "repair_required").length;
  const verified = Boolean(
    blockingFindingCount === 0 &&
    repairVerdicts === 0 &&
    approved >= requiredApprovals
  );
  const status = verified
    ? "APPROVED"
    : blockingFindingCount > 0 || repairVerdicts > 0
      ? "REPAIR_REQUIRED"
      : "UNAVAILABLE";

  return {
    contract: CODE_AI_FINAL_INDEPENDENT_REVIEW_CONTRACT,
    status,
    required: true,
    verified,
    risk,
    fingerprint,
    required_approvals: requiredApprovals,
    reviewer_count_requested: reviews.length,
    reviewer_count_succeeded: succeeded,
    approved_review_count: approved,
    blocking_finding_count: blockingFindingCount,
    repair_verdict_count: repairVerdicts,
    reviews,
    concurrent_dispatch: true,
    elapsed_ms: Date.now() - startedAt,
    specialist_reasoning_calls_requested: reviews.length,
    additional_code_reasoning_calls_consumed: 0,
    source_mutation_authority: false,
    reviewers_share_source_workspace: false,
    deterministic_verification_remains_authoritative: true,
    authorization_effect: "NONE",
    execution_effect: "REVIEW_ONLY",
    raw_reasoning_persisted: false,
    reused_from_attested_resume_state: false,
  };
}

export const CodeAIFinalIndependentReviewRuntime = Object.freeze({
  contract: CODE_AI_FINAL_INDEPENDENT_REVIEW_CONTRACT,
  roles: REVIEW_ROLES.map((role) => ({ id: role.id, execution_lane: role.execution_lane })),
  requiredForRisk: codeAIFinalIndependentReviewRequiredForRisk,
  fingerprint: codeAIFinalIndependentReviewFingerprint,
  assessGate: assessCodeAIFinalIndependentReviewGate,
  run: runCodeAIFinalIndependentReview,
});

export default CodeAIFinalIndependentReviewRuntime;