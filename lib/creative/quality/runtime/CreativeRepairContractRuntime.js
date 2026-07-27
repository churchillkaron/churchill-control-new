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

export function unwrapRepairEvidence(value = {}) {
  let current = value;
  const seen = new Set();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const next = current.output || current.result || current.data || current.json || null;
    if (!next || next === current) break;
    current = next;
  }
  return object(current);
}

export function qualityPassed(value = {}) {
  const evidence = unwrapRepairEvidence(value);
  if (evidence.passed === true || evidence.approved === true || evidence.release_readiness === true) {
    return true;
  }
  const verdict = text(
    evidence.verdict || evidence.status || evidence.result || evidence.decision,
  ).toUpperCase();
  return ["PASS", "PASSED", "APPROVED", "READY", "RELEASE_READY"].includes(verdict);
}

export function qualityFailures(value = {}) {
  const evidence = unwrapRepairEvidence(value);
  return [
    ...list(evidence.failed_checks),
    ...list(evidence.failures),
    ...list(evidence.critical_failures),
    ...list(evidence.validation_failures).map((item) =>
      typeof item === "string" ? item : item?.code || item?.message,
    ),
    ...list(evidence.issues).map((item) =>
      typeof item === "string" ? item : item?.message || item?.issue || item?.failure,
    ),
  ].filter(Boolean).map(String);
}

export function repairInstructions(value = {}) {
  const evidence = unwrapRepairEvidence(value);
  return [...new Set([
    ...list(evidence.repair_instructions),
    ...list(evidence.correction_instructions),
    ...list(evidence.recommendations),
    ...list(evidence.repair_plan).map((item) =>
      typeof item === "string" ? item : item?.instruction || item?.repair_instruction,
    ),
    ...list(evidence.issues).map((item) =>
      typeof item === "object" ? item?.correction || item?.repair : null,
    ),
  ].filter(Boolean).map(String))];
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
