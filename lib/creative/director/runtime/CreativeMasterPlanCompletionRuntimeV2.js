import crypto from "node:crypto";

import {
  CREATIVE_AGENCY_ROLES,
} from "@/lib/creative/director/registry/CreativeAgencyRoleRegistry";

const PROMPT_FIELDS = new Set([
  "prompt",
  "provider_prompt",
  "visual_prompt",
  "video_prompt",
  "negative_prompt",
  "instruction",
  "instructions",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique(values = []) {
  return [...new Set(list(values).flat(Infinity).map(text).filter(Boolean))];
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function authoritySnapshot(plan = {}) {
  const { completion, ...authority } = object(plan);
  return authority;
}

function requireText(value, path, missing, minimum = 1) {
  if (text(value).length >= minimum) return;
  missing.push(path);
}

function requireObject(value, path, missing) {
  if (Object.keys(object(value)).length) return;
  missing.push(path);
}

function requireList(value, path, missing) {
  if (list(value).length) return;
  missing.push(path);
}

function findStoredPromptFields(value, path = "plan", findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      findStoredPromptFields(item, `${path}.${index}`, findings));
    return findings;
  }
  if (!value || typeof value !== "object") return findings;

  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (PROMPT_FIELDS.has(normalized) && text(child)) {
      findings.push(`${path}.${key}`);
    }
    findStoredPromptFields(child, `${path}.${key}`, findings);
  }
  return findings;
}

function validateConcept(plan, missing) {
  const concept = object(plan.concept);
  requireObject(concept, "concept", missing);
  for (const field of [
    "title",
    "creative_thesis",
    "hook",
    "message",
    "narrative",
    "visual_system",
    "emotional_promise",
    "call_to_action",
  ]) {
    requireText(concept[field], `concept.${field}`, missing);
  }
}

function validateStory(plan, missing) {
  const story = object(plan.story);
  requireObject(story, "story", missing);
  for (const field of [
    "hook",
    "audience_tension",
    "escalation",
    "observable_proof",
    "turn",
    "resolution",
    "call_to_action",
    "emotional_arc",
    "anti_cliche_strategy",
  ]) {
    requireText(story[field], `story.${field}`, missing);
  }
}

function validateRoleDecisions(plan, workflowKind, missing) {
  const decisions = object(plan.role_decisions);
  requireObject(decisions, "role_decisions", missing);

  for (const role of CREATIVE_AGENCY_ROLES) {
    const applies = role.applies_to.includes("ALL") ||
      role.applies_to.includes(workflowKind);
    const decision = object(decisions[role.id]);
    const path = `role_decisions.${role.id}`;
    if (!Object.keys(decision).length) {
      if (applies) missing.push(path);
      continue;
    }

    const status = text(decision.status).toUpperCase();
    if (!["ACTIVE", "NOT_REQUIRED"].includes(status)) {
      missing.push(`${path}.status`);
      continue;
    }
    if (status === "NOT_REQUIRED") continue;

    requireText(decision.decision, `${path}.decision`, missing);
    requireList(decision.evidence, `${path}.evidence`, missing);
    const confidence = finite(decision.confidence);
    if (confidence === null || confidence < 0 || confidence > 100) {
      missing.push(`${path}.confidence`);
    }
  }
}

function validateDeliverables(plan, missing) {
  const deliverables = list(plan.deliverables);
  requireList(deliverables, "deliverables", missing);
  deliverables.forEach((deliverable, index) => {
    const path = `deliverables.${index}`;
    requireText(deliverable?.id, `${path}.id`, missing);
    requireText(deliverable?.type, `${path}.type`, missing);
    requireText(deliverable?.purpose, `${path}.purpose`, missing);
    requireObject(deliverable?.output_spec, `${path}.output_spec`, missing);
  });
}

function validateShot(shot, sceneIndex, shotIndex, missing) {
  const path = `scenes.${sceneIndex}.shots.${shotIndex}`;
  for (const field of [
    "id",
    "title",
    "purpose",
    "subject",
    "action",
    "performance",
  ]) {
    requireText(shot?.[field], `${path}.${field}`, missing);
  }

  const duration = finite(shot?.duration_seconds);
  if (duration === null || duration <= 0) {
    missing.push(`${path}.duration_seconds`);
  }

  const framePlan = object(shot?.frame_plan);
  requireObject(framePlan, `${path}.frame_plan`, missing);
  for (const field of ["opening_frame", "progression", "closing_frame"]) {
    requireText(framePlan[field], `${path}.frame_plan.${field}`, missing);
  }

  for (const field of [
    "camera",
    "lighting",
    "production_design",
    "continuity",
    "audio",
  ]) {
    requireObject(shot?.[field], `${path}.${field}`, missing);
  }

  requireList(shot?.negative_constraints, `${path}.negative_constraints`, missing);
  requireList(shot?.repair_instructions, `${path}.repair_instructions`, missing);
  requireObject(shot?.generation?.output_spec, `${path}.generation.output_spec`, missing);
}

function validateScenes(plan, missing) {
  const scenes = list(plan.scenes);
  requireList(scenes, "scenes", missing);
  scenes.forEach((scene, sceneIndex) => {
    const path = `scenes.${sceneIndex}`;
    for (const field of [
      "id",
      "title",
      "objective",
      "story_state_before",
      "state_change",
      "story_state_after",
      "transition_logic",
    ]) {
      requireText(scene?.[field], `${path}.${field}`, missing);
    }

    const shots = list(scene?.shots);
    requireList(shots, `${path}.shots`, missing);
    shots.forEach((shot, shotIndex) =>
      validateShot(shot, sceneIndex, shotIndex, missing));
  });
}

function validatePlan(plan = {}) {
  const missing = [];
  const workflowKind = text(plan.workflow_kind).toUpperCase();
  requireText(workflowKind, "workflow_kind", missing);
  validateConcept(plan, missing);
  validateStory(plan, missing);
  validateDeliverables(plan, missing);
  validateRoleDecisions(plan, workflowKind, missing);
  validateScenes(plan, missing);

  const storedPromptFields = findStoredPromptFields(plan);
  const blockingIssues = [
    ...unique(missing).map((path) => `REQUIRED_FIELD_MISSING:${path}`),
    ...unique(storedPromptFields).map((path) => `STORED_PROMPT_FIELD_PROHIBITED:${path}`),
  ];

  return {
    missing_fields: unique(missing),
    stored_prompt_fields: unique(storedPromptFields),
    blocking_issues: blockingIssues,
    passed: blockingIssues.length === 0,
  };
}

export const CreativeMasterPlanCompletionRuntimeV2 = Object.freeze({
  complete({ plan = {} } = {}) {
    const source = object(plan);
    const authorityBefore = digest(authoritySnapshot(source));
    const validation = validatePlan(source);
    const completed = {
      ...source,
      completion: {
        contract: "CREATIVE_MASTER_PLAN_COMPLETION_V3",
        legacy_contract: "CREATIVE_MASTER_PLAN_COMPLETION_V2",
        mode: "VALIDATE_APPROVED_MASTER_PLAN",
        passed: validation.passed,
        blocking_issues: validation.blocking_issues,
        missing_fields: validation.missing_fields,
        stored_prompt_fields: validation.stored_prompt_fields,
        transformation_executed: false,
        concept_rewrite_executed: false,
        story_rewrite_executed: false,
        scene_rewrite_executed: false,
        shot_rewrite_executed: false,
        provider_prompt_generation_executed: false,
        negative_prompt_generation_executed: false,
        fixed_template_completion_used: false,
        fixed_business_vocabulary_used: false,
        organization_specific_copy_used: false,
        repaired_field_count: 0,
        repaired_fields: [],
        preserved_provider_direction: true,
        promptless_required: true,
        provider_calls_executed: false,
        completed_at: new Date().toISOString(),
        story_authority_hash_before: authorityBefore,
      },
    };
    const authorityAfter = digest(authoritySnapshot(completed));
    if (authorityBefore !== authorityAfter) {
      throw new Error(
        `CREATIVE_MASTER_PLAN_COMPLETION_STORY_AUTHORITY_CHANGED:${authorityBefore}:${authorityAfter}`,
      );
    }

    return {
      ...completed,
      completion: {
        ...completed.completion,
        story_authority_hash_after: authorityAfter,
        story_authority_unchanged: true,
      },
    };
  },
});
