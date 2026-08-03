import crypto from "node:crypto";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const QUALITY_KEYS = new Set([
  "passed",
  "approved",
  "release_readiness",
  "verdict",
  "decision",
  "overall_score",
  "scores",
  "checks",
  "failures",
  "failed_checks",
  "critical_failures",
  "validation_failures",
  "issues",
  "repair_instructions",
  "correction_instructions",
  "recommendations",
  "repair_plan",
]);

const NESTED_EVIDENCE_KEYS = [
  "perceptual_validation",
  "validation",
  "review",
  "evidence",
  "output",
  "result",
  "data",
  "json",
  "provider_poll",
  "provider_submission",
];

function hasQualityKeys(value = {}) {
  return Object.keys(object(value)).some((key) => QUALITY_KEYS.has(key));
}

function collectEvidenceObjects(value, depth = 0, seen = new Set(), output = []) {
  if (!value || typeof value !== "object" || depth > 7 || seen.has(value)) {
    return output;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) collectEvidenceObjects(item, depth + 1, seen, output);
    return output;
  }

  if (hasQualityKeys(value)) output.push(value);

  for (const key of NESTED_EVIDENCE_KEYS) {
    if (value[key] && typeof value[key] === "object") {
      collectEvidenceObjects(value[key], depth + 1, seen, output);
    }
  }
  return output;
}

function evidenceObjects(value = {}) {
  const root = object(value);
  const collected = collectEvidenceObjects(root);
  return collected.length ? collected : [root];
}

function explicitBoolean(evidence, key) {
  return typeof evidence?.[key] === "boolean" ? evidence[key] : null;
}

function failureLabel(item) {
  if (typeof item === "string") return text(item);
  const value = object(item);
  const code = text(value.code || value.id || value.type);
  const message = text(
    value.message ||
    value.issue ||
    value.failure ||
    value.summary ||
    value.evidence,
  );
  if (code && message) return `${code}: ${message}`;
  return code || message || null;
}

function instructionLabel(item) {
  if (typeof item === "string") return text(item);
  const value = object(item);
  return text(
    value.repair_instruction ||
    value.repairInstruction ||
    value.correction_instruction ||
    value.correctionInstruction ||
    value.instruction ||
    value.correction ||
    value.repair ||
    value.recommendation,
  );
}

export function unwrapRepairEvidence(value = {}) {
  const candidates = evidenceObjects(value);
  return candidates.find((candidate) =>
    candidate.perceptual_validation ||
    candidate.passed !== undefined ||
    candidate.approved !== undefined ||
    candidate.overall_score !== undefined ||
    candidate.failures ||
    candidate.issues,
  ) || candidates[0] || {};
}

export function qualityPassed(value = {}) {
  const candidates = evidenceObjects(value);

  for (const candidate of candidates) {
    const passed = explicitBoolean(candidate, "passed");
    if (passed !== null) return passed;
    const approved = explicitBoolean(candidate, "approved");
    if (approved !== null) return approved;
    const releaseReadiness = explicitBoolean(candidate, "release_readiness");
    if (releaseReadiness !== null) return releaseReadiness;

    const verdict = text(
      candidate.verdict || candidate.status || candidate.decision,
    ).toUpperCase();
    if (["FAIL", "FAILED", "REJECTED", "NOT_READY", "BLOCKED"].includes(verdict)) {
      return false;
    }
    if (["PASS", "PASSED", "APPROVED", "READY", "RELEASE_READY"].includes(verdict)) {
      return true;
    }
  }
  return false;
}

export function qualityFailures(value = {}) {
  const failures = [];
  for (const evidence of evidenceObjects(value)) {
    for (const item of [
      ...list(evidence.failed_checks),
      ...list(evidence.failures),
      ...list(evidence.critical_failures),
      ...list(evidence.validation_failures),
      ...list(evidence.issues),
    ]) {
      const label = failureLabel(item);
      if (label) failures.push(label);
    }
  }
  return [...new Set(failures)];
}

export function repairInstructions(value = {}) {
  const instructions = [];
  for (const evidence of evidenceObjects(value)) {
    for (const item of [
      ...list(evidence.repair_instructions),
      ...list(evidence.correction_instructions),
      ...list(evidence.recommendations),
      ...list(evidence.repair_plan),
      ...list(evidence.failed_checks),
      ...list(evidence.failures),
      ...list(evidence.critical_failures),
      ...list(evidence.validation_failures),
      ...list(evidence.issues),
    ]) {
      const instruction = instructionLabel(item);
      if (instruction) instructions.push(instruction);
    }
  }
  return [...new Set(instructions)];
}

export function repairPolicy(project = {}) {
  const configured = {
    ...object(project.metadata?.quality_repair),
    ...object(project.metadata?.repair),
  };
  const configuredAutomatic =
    configured.allow_automatic_repair ??
    configured.allowAutomaticRepair ??
    process.env.CREATIVE_ALLOW_AUTOMATIC_REPAIR;
  return {
    version: text(configured.version || process.env.CREATIVE_REPAIR_POLICY_VERSION || "1"),
    allow_automatic_repair: configuredAutomatic !== false && configuredAutomatic !== "false",
    max_attempts: Math.max(0, Math.floor(finite(
      configured.max_attempts ?? configured.maxAttempts ?? process.env.CREATIVE_MAX_REPAIR_ATTEMPTS,
      2,
    ))),
    require_bounded_instructions: configured.require_bounded_instructions !== false,
    allow_provider_retry: configured.allow_provider_retry !== false,
    allow_quality_repair: configured.allow_quality_repair !== false,
    preserve_approved_cost_ceiling: configured.preserve_approved_cost_ceiling !== false,
  };
}

export function repairAttempt(task = {}) {
  return Math.max(0, Math.floor(finite(task.metadata?.repair_attempt, 0)));
}

export function repairIdentity({ source_task_id, quality_task_id = null, attempt, failures, instructions } = {}) {
  return crypto.createHash("sha256").update(JSON.stringify({
    source_task_id,
    quality_task_id,
    attempt,
    failures: list(failures),
    instructions: list(instructions),
  })).digest("hex");
}

export function assertAutomaticRepairAllowed({ policy, sourceTask, instructions = [] } = {}) {
  if (!policy?.allow_automatic_repair) throw new Error("CREATIVE_AUTOMATIC_REPAIR_NOT_ENABLED");
  const attempt = repairAttempt(sourceTask) + 1;
  if (attempt > Number(policy.max_attempts || 0)) {
    throw new Error("CREATIVE_REPAIR_ATTEMPT_LIMIT_REACHED");
  }
  if (policy.require_bounded_instructions && !list(instructions).length) {
    throw new Error("CREATIVE_BOUNDED_REPAIR_INSTRUCTIONS_REQUIRED");
  }
  const estimated = Number(sourceTask?.cost?.estimated || 0);
  if (
    policy.preserve_approved_cost_ceiling &&
    estimated > 0 &&
    sourceTask?.cost?.approved !== true
  ) {
    throw new Error("CREATIVE_REPAIR_COST_APPROVAL_REQUIRED");
  }
  return attempt;
}

export const CreativeRepairContractRuntime = {
  policy: repairPolicy,
  passed: qualityPassed,
  failures: qualityFailures,
  instructions: repairInstructions,
  identity: repairIdentity,
};
