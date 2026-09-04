import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import {
  CreativeProfessionalDirectionAuthorityRuntime,
} from "@/lib/creative/continuity/runtime/CreativeProfessionalDirectionAuthorityRuntime";

export const CREATIVE_SURGICAL_SHOT_REVISION_CONTRACT =
  "AVANTIQO_SURGICAL_SHOT_REVISION_V1";

const ALLOWED_SCOPES = new Set([
  "camera",
  "coverage",
  "continuity",
  "performance",
  "edit",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value, limit = 5000) {
  return String(value ?? "").trim().slice(0, limit);
}

function normalizeScope(value) {
  return [...new Set(list(value).map((item) => text(item, 80).toLowerCase()))]
    .filter((item) => ALLOWED_SCOPES.has(item));
}

function normalizedReasoningOutput(result = {}) {
  const value = result?.output?.output || result?.output || result || {};
  if (value && typeof value === "object") return value.result || value;
  const source = text(value, 200000);
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try {
    const parsed = JSON.parse(source.slice(first, last + 1));
    return parsed.result || parsed;
  } catch {
    return null;
  }
}

function shotSnapshot(shot = {}) {
  return {
    id: shot.id,
    scene_id: shot.scene_id,
    shot_number: shot.shot_number,
    title: shot.title,
    purpose: shot.purpose,
    subject: shot.subject,
    action: shot.action,
    performance: shot.performance,
    duration_seconds: shot.duration_seconds,
    camera: object(shot.camera),
    coverage: object(shot.coverage || shot.metadata?.coverage),
    continuity: object(shot.continuity),
    transition_in: shot.transition_in || "",
    transition_out: shot.transition_out || "",
    metadata: {
      direction_authority: shot.metadata?.direction_authority || null,
      human_direction_sections: list(shot.metadata?.human_direction_sections),
      revision_number: Number(shot.metadata?.revision_number || 0),
    },
  };
}

function revisionPrompt({ instruction, scope, previous, target, next }) {
  return `
You are Avantiqo's film director, cinematographer, continuity supervisor and picture editor.
Perform one SURGICAL revision to one existing shot. Do not rewrite the film.

Return strict JSON only with this exact structure:
{
  "contract": "${CREATIVE_SURGICAL_SHOT_REVISION_CONTRACT}",
  "target_shot_id": "exact target id",
  "scope": ["camera|coverage|continuity|performance|edit"],
  "reason": "why this revision satisfies the user request without broadening the change",
  "target_patch": {
    "camera": {},
    "coverage": {},
    "continuity": {},
    "performance": null,
    "transition_in": null,
    "transition_out": null
  },
  "adjacent_repairs": [
    {
      "shot_id": "exact previous or next shot id",
      "coverage": {},
      "continuity": {},
      "transition_in": null,
      "transition_out": null,
      "reason": "only the dependency repair required because the target changed"
    }
  ]
}

USER REVISION
${JSON.stringify(instruction)}

AUTHORIZED REVISION SCOPE
${JSON.stringify(scope)}

PREVIOUS SHOT
${JSON.stringify(previous || null)}

TARGET SHOT
${JSON.stringify(target)}

NEXT SHOT
${JSON.stringify(next || null)}

RULES
- target_shot_id must equal the target id exactly.
- Return the same scope values you were authorized to use. Never widen scope.
- Only populate target_patch sections authorized by scope.
- camera scope may change camera only.
- coverage scope may change coverage only.
- continuity scope may change continuity only.
- performance scope may change performance only.
- edit scope may change transition_in and transition_out and coverage fields that describe edit relationship, match action, edit compatibility, or shot-to-shot contrast. It may not redesign camera.
- Adjacent repairs may touch ONLY coverage, continuity and transitions, and only when the target revision creates a real dependency consequence.
- Adjacent repairs may reference only the exact previous or next shot id supplied above.
- Preserve purpose, subject, action, duration, identity, source assets, product truth, brand truth, generation service/capability and all unrelated approved direction.
- Pro Studio locked fields are immutable production truth for AI. Never change them, including through an adjacent dependency repair.
- A human-authored section is production truth. Do not change a human-authored section unless that section is explicitly present in AUTHORIZED REVISION SCOPE and is not Pro Studio locked.
- Do not add shots, remove shots, reorder shots, alter duration or trigger generation.
- Do not emit provider prompts or provider parameters.
- If no adjacent repair is required, return adjacent_repairs as an empty array.
`;
}

function allowedTargetKeys(scope) {
  const keys = new Set();
  if (scope.includes("camera")) keys.add("camera");
  if (scope.includes("coverage")) keys.add("coverage");
  if (scope.includes("continuity")) keys.add("continuity");
  if (scope.includes("performance")) keys.add("performance");
  if (scope.includes("edit")) {
    keys.add("transition_in");
    keys.add("transition_out");
    keys.add("coverage");
  }
  return keys;
}

const EDIT_COVERAGE_FIELDS = new Set([
  "shot_to_shot_contrast",
  "edit_compatibility_status",
  "edit_relationship",
  "match_action",
  "continuity_consequence",
]);

function validateTargetPatch(patch, scope) {
  const allowed = allowedTargetKeys(scope);
  const forbidden = Object.keys(object(patch)).filter(
    (key) => !allowed.has(key) && patch[key] != null,
  );
  if (forbidden.length) {
    throw new Error(`CREATIVE_SURGICAL_REVISION_SCOPE_VIOLATION:${forbidden.join(",")}`);
  }

  if (scope.includes("edit") && !scope.includes("coverage")) {
    const coverage = object(patch.coverage);
    const forbiddenCoverage = Object.keys(coverage).filter(
      (key) => !EDIT_COVERAGE_FIELDS.has(key),
    );
    if (forbiddenCoverage.length) {
      throw new Error(
        `CREATIVE_SURGICAL_EDIT_SCOPE_VIOLATION:${forbiddenCoverage.join(",")}`,
      );
    }
  }
}

function assertProfessionalLocksPreserved({ shot, patch, boundary }) {
  const inspected = CreativeProfessionalDirectionAuthorityRuntime.stripLockedPatch(
    shot,
    patch,
  );
  if (!inspected.preserved_locked_fields.length) return;

  const error = new Error(
    `CREATIVE_SURGICAL_REVISION_PROFESSIONAL_LOCKED:${inspected.preserved_locked_fields.slice(0, 12).join(",")}`,
  );
  error.status = 409;
  error.details = {
    contract: CREATIVE_SURGICAL_SHOT_REVISION_CONTRACT,
    boundary,
    shot_id: shot.id,
    locked_fields: inspected.preserved_locked_fields,
    resolution:
      "Release the relevant Pro Studio field lock before AI may change that craft decision.",
  };
  throw error;
}

function adjacentPatch(repair = {}) {
  return {
    coverage: object(repair.coverage),
    continuity: object(repair.continuity),
    ...(repair.transition_in != null
      ? { transition_in: text(repair.transition_in, 1800) }
      : {}),
    ...(repair.transition_out != null
      ? { transition_out: text(repair.transition_out, 1800) }
      : {}),
  };
}

function mergeSection(current, patch) {
  return {
    ...object(current),
    ...object(patch),
  };
}

function revisionHistory(metadata = {}, entry) {
  return [...list(metadata.revision_history), entry].slice(-20);
}

async function applyTarget({ shot, patch, scope, instruction, reason }) {
  const now = new Date().toISOString();
  const metadata = object(shot.metadata);
  const humanSections = new Set(list(metadata.human_direction_sections));
  const touched = [];
  const values = {};

  if (scope.includes("camera") && Object.keys(object(patch.camera)).length) {
    values.camera = mergeSection(shot.camera, patch.camera);
    touched.push("camera");
  }
  if ((scope.includes("coverage") || scope.includes("edit")) && Object.keys(object(patch.coverage)).length) {
    values.coverage = mergeSection(shot.coverage, patch.coverage);
    touched.push("coverage");
  }
  if (scope.includes("continuity") && Object.keys(object(patch.continuity)).length) {
    values.continuity = mergeSection(shot.continuity, patch.continuity);
    touched.push("continuity");
  }
  if (scope.includes("performance") && patch.performance != null) {
    values.performance = text(patch.performance, 3000);
    touched.push("performance");
  }
  if (scope.includes("edit")) {
    if (patch.transition_in != null) {
      values.transition_in = text(patch.transition_in, 1800);
      touched.push("transition_in");
    }
    if (patch.transition_out != null) {
      values.transition_out = text(patch.transition_out, 1800);
      touched.push("transition_out");
    }
  }

  const overriddenHumanSections = touched.filter((section) => humanSections.has(section));
  values.metadata = {
    ...metadata,
    direction_authority: "AI_SURGICAL_REVISION",
    last_revision_scope: scope,
    last_revision_instruction: text(instruction, 1600),
    last_revision_reason: text(reason, 2000),
    last_revision_at: now,
    revision_number: Number(metadata.revision_number || 0) + 1,
    human_direction_sections: [...humanSections],
    human_direction_overridden_sections: overriddenHumanSections,
    revision_history: revisionHistory(metadata, {
      at: now,
      authority: "AI_SURGICAL_REVISION",
      scope,
      instruction: text(instruction, 1000),
      reason: text(reason, 1200),
      touched,
    }),
  };

  return ShotRuntime.update(shot.id, values);
}

async function applyAdjacentRepair({ shot, repair, instruction, targetId }) {
  const metadata = object(shot.metadata);
  const now = new Date().toISOString();
  const values = {};
  const touched = [];
  if (Object.keys(object(repair.coverage)).length) {
    values.coverage = mergeSection(shot.coverage, repair.coverage);
    touched.push("coverage");
  }
  if (Object.keys(object(repair.continuity)).length) {
    values.continuity = mergeSection(shot.continuity, repair.continuity);
    touched.push("continuity");
  }
  if (repair.transition_in != null) {
    values.transition_in = text(repair.transition_in, 1800);
    touched.push("transition_in");
  }
  if (repair.transition_out != null) {
    values.transition_out = text(repair.transition_out, 1800);
    touched.push("transition_out");
  }
  if (!touched.length) return shot;

  values.metadata = {
    ...metadata,
    direction_authority: metadata.direction_authority || "AI_DIRECTOR",
    dependency_repair_for_shot_id: targetId,
    dependency_repair_at: now,
    revision_number: Number(metadata.revision_number || 0) + 1,
    revision_history: revisionHistory(metadata, {
      at: now,
      authority: "AI_DEPENDENCY_REPAIR",
      target_shot_id: targetId,
      instruction: text(instruction, 1000),
      reason: text(repair.reason, 1200),
      touched,
    }),
  };
  return ShotRuntime.update(shot.id, values);
}

export const CreativeShotSurgicalRevisionRuntime = Object.freeze({
  contract: CREATIVE_SURGICAL_SHOT_REVISION_CONTRACT,

  async revise({
    organization_id,
    creative_project_id,
    shot_id,
    instruction,
    revision_scope,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    if (!shot_id) throw new Error("shot_id required");
    if (!text(instruction, 1600)) throw new Error("revision instruction required");

    const scope = normalizeScope(revision_scope);
    if (!scope.length) throw new Error("CREATIVE_SURGICAL_REVISION_SCOPE_REQUIRED");

    const projectShots = await ShotRuntime.list({
      organization_id,
      creative_project_id,
    });
    const targetIndex = projectShots.findIndex((shot) => shot.id === shot_id);
    if (targetIndex < 0) throw new Error("CREATIVE_SURGICAL_REVISION_SHOT_NOT_FOUND");
    const target = projectShots[targetIndex];
    const previous = projectShots[targetIndex - 1] || null;
    const next = projectShots[targetIndex + 1] || null;

    const result = await ServiceExecutionRuntime.execute({
      organization_id,
      service_id: "ai.reasoning.execute",
      provider_id: null,
      category: "CREATIVE_DIRECTION",
      input: {
        quantity: 1,
        max_output_tokens: 7000,
        response_format: { type: "json_object" },
        prompt: revisionPrompt({
          instruction: text(instruction, 1600),
          scope,
          previous: previous ? shotSnapshot(previous) : null,
          target: shotSnapshot(target),
          next: next ? shotSnapshot(next) : null,
        }),
      },
      metadata: {
        module: "CREATIVE",
        operation: "SURGICAL_SHOT_REVISION_V1",
        creative_project_id,
        shot_id,
        media_generation_executed: false,
      },
    });

    const output = normalizedReasoningOutput(result);
    if (!output) throw new Error("CREATIVE_SURGICAL_REVISION_OUTPUT_INVALID");
    if (text(output.contract, 160) !== CREATIVE_SURGICAL_SHOT_REVISION_CONTRACT) {
      throw new Error("CREATIVE_SURGICAL_REVISION_CONTRACT_INVALID");
    }
    if (text(output.target_shot_id, 180) !== shot_id) {
      throw new Error("CREATIVE_SURGICAL_REVISION_TARGET_MISMATCH");
    }
    const returnedScope = normalizeScope(output.scope);
    if (JSON.stringify(returnedScope.sort()) !== JSON.stringify([...scope].sort())) {
      throw new Error("CREATIVE_SURGICAL_REVISION_SCOPE_WIDENED");
    }

    const targetPatch = object(output.target_patch);
    validateTargetPatch(targetPatch, scope);
    assertProfessionalLocksPreserved({
      shot: target,
      patch: targetPatch,
      boundary: "TARGET",
    });

    const allowedAdjacentIds = new Set([previous?.id, next?.id].filter(Boolean));
    const repairs = list(output.adjacent_repairs);
    for (const repair of repairs) {
      if (!allowedAdjacentIds.has(text(repair.shot_id, 180))) {
        throw new Error("CREATIVE_SURGICAL_REVISION_ADJACENT_SCOPE_VIOLATION");
      }
      const forbidden = Object.keys(object(repair)).filter(
        (key) => ![
          "shot_id",
          "coverage",
          "continuity",
          "transition_in",
          "transition_out",
          "reason",
        ].includes(key),
      );
      if (forbidden.length) {
        throw new Error(
          `CREATIVE_SURGICAL_REVISION_ADJACENT_FIELD_VIOLATION:${forbidden.join(",")}`,
        );
      }

      const adjacent = repair.shot_id === previous?.id ? previous : next;
      if (adjacent) {
        assertProfessionalLocksPreserved({
          shot: adjacent,
          patch: adjacentPatch(repair),
          boundary: "ADJACENT_REPAIR",
        });
      }
    }

    const updatedTarget = await applyTarget({
      shot: target,
      patch: targetPatch,
      scope,
      instruction,
      reason: output.reason,
    });

    const repaired = [];
    for (const repair of repairs) {
      const adjacent = repair.shot_id === previous?.id ? previous : next;
      if (!adjacent) continue;
      repaired.push(await applyAdjacentRepair({
        shot: adjacent,
        repair,
        instruction,
        targetId: target.id,
      }));
    }

    return {
      success: true,
      contract: CREATIVE_SURGICAL_SHOT_REVISION_CONTRACT,
      creative_project_id,
      shot_id,
      revision_scope: scope,
      revised_shot: updatedTarget,
      adjacent_repairs: repaired.map((shot) => ({
        shot_id: shot.id,
        revision_number: Number(shot.metadata?.revision_number || 0),
      })),
      reason: text(output.reason, 2000),
      professional_locks_preserved: true,
      media_generation_executed: false,
      publish_authorized: false,
      usage: result?.usage || result?.output?.usage || null,
      billing: result?.billing || result?.output?.billing || null,
    };
  },
});

export default CreativeShotSurgicalRevisionRuntime;
