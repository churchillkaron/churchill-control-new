import { createHash } from "node:crypto";

import {
  CreativeDetailedStorySemanticRevalidationRuntimeV5,
} from "@/lib/creative/production/story/CreativeDetailedStorySemanticRevalidationRuntimeV5";

const RUNTIME_VERSION =
  "CREATIVE_DETAILED_STORY_HUMAN_NORMALIZATION_V1";

const ALLOWED_FIELDS = new Set([
  "story_purpose",
  "narrative_state_before",
  "narrative_state_after",
  "opening_frame",
  "closing_frame",
  "decisive_moment",
  "screen_direction",
  "environment_action",
  "foreground_action",
  "midground_action",
  "background_action",
  "action_beats",
  "actors",
  "subject_paths",
  "relationships",
  "performance_direction",
  "camera",
  "provider_brief",
  "qa_checks",
  "forbidden_interpretations",
  "negative_constraints",
  "still_frame_rules",
  "semantic_repair_notes",
]);

const PROTECTED_FIELDS = [
  "scene_number",
  "shot_number",
  "title",
  "duration_seconds",
  "reference_asset_ids",
  "reference_grounding",
  "preserve_from_references",
  "may_interpret_creatively",
  "missing_evidence",
  "lighting",
  "products",
  "provider_text_policy",
  "post_production_overlays",
  "transition_in",
  "transition_out",
];

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value || "").trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function hash(value) {
  return createHash("sha256")
    .update(JSON.stringify(value || {}))
    .digest("hex");
}

function runtimeError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function storyShotMap(story = {}) {
  const map = new Map();

  list(story.scenes).forEach((scene, sceneIndex) => {
    list(scene.shots).forEach((shot, shotIndex) => {
      map.set(`${sceneIndex + 1}:${shotIndex + 1}`, {
        sceneIndex,
        shotIndex,
        shot,
      });
    });
  });

  return map;
}

function validateDirective(directive = {}, sourceMap) {
  const key = text(directive.key);
  const replacements = object(directive.replacements);
  const source = sourceMap.get(key);

  if (!key || !source) {
    throw runtimeError(
      "CREATIVE_HUMAN_NORMALIZATION_TARGET_NOT_FOUND",
      { key },
    );
  }
  if (!Object.keys(replacements).length) {
    throw runtimeError(
      "CREATIVE_HUMAN_NORMALIZATION_REPLACEMENTS_REQUIRED",
      { key },
    );
  }

  const forbiddenFields = Object.keys(replacements).filter(
    (field) => !ALLOWED_FIELDS.has(field),
  );

  if (forbiddenFields.length) {
    throw runtimeError(
      "CREATIVE_HUMAN_NORMALIZATION_FIELD_NOT_ALLOWED",
      { key, forbidden_fields: forbiddenFields },
    );
  }

  return {
    key,
    replacements,
    forbidden_phrases: list(directive.forbidden_phrases)
      .map(text)
      .filter(Boolean),
    require_opening_closing_identity:
      directive.require_opening_closing_identity === true,
  };
}

function protectedSnapshot(shot = {}) {
  return Object.fromEntries(
    PROTECTED_FIELDS.map((field) => [field, clone(shot[field])]),
  );
}

function applyDirectives(story, directives) {
  const output = clone(story);
  const sourceMap = storyShotMap(story);
  const beforeHashes = new Map(
    [...sourceMap.entries()].map(([key, value]) => [
      key,
      hash(value.shot),
    ]),
  );

  for (const directive of directives) {
    const target = sourceMap.get(directive.key);
    const shot = output.scenes[target.sceneIndex]
      .shots[target.shotIndex];
    const protectedBefore = protectedSnapshot(shot);

    output.scenes[target.sceneIndex].shots[target.shotIndex] = {
      ...shot,
      ...clone(directive.replacements),
    };

    const normalized = output.scenes[target.sceneIndex]
      .shots[target.shotIndex];
    const protectedAfter = protectedSnapshot(normalized);

    if (hash(protectedBefore) !== hash(protectedAfter)) {
      throw runtimeError(
        "CREATIVE_HUMAN_NORMALIZATION_PROTECTED_FIELDS_CHANGED",
        { key: directive.key },
      );
    }

    const normalizedText = JSON.stringify(normalized).toLowerCase();
    const matchedForbidden = directive.forbidden_phrases.filter(
      (phrase) => normalizedText.includes(phrase.toLowerCase()),
    );

    if (matchedForbidden.length) {
      throw runtimeError(
        "CREATIVE_HUMAN_NORMALIZATION_FORBIDDEN_PHRASE_REMAINS",
        {
          key: directive.key,
          phrases: matchedForbidden,
        },
      );
    }

    if (
      directive.require_opening_closing_identity &&
      text(normalized.opening_frame) !== text(normalized.closing_frame)
    ) {
      throw runtimeError(
        "CREATIVE_HUMAN_NORMALIZATION_FRAME_IDENTITY_REQUIRED",
        { key: directive.key },
      );
    }
  }

  const afterMap = storyShotMap(output);
  const targetKeys = new Set(directives.map((item) => item.key));
  const preserved = [];
  const unexpected = [];

  for (const [key, beforeHash] of beforeHashes.entries()) {
    if (targetKeys.has(key)) continue;
    const afterHash = hash(afterMap.get(key)?.shot);

    if (beforeHash === afterHash) {
      preserved.push(key);
    } else {
      unexpected.push({
        key,
        before_hash: beforeHash,
        after_hash: afterHash,
      });
    }
  }

  if (unexpected.length) {
    throw runtimeError(
      "CREATIVE_HUMAN_NORMALIZATION_CHANGED_UNTARGETED_SHOTS",
      { changed: unexpected },
    );
  }

  return {
    story: output,
    preserved_shot_keys: preserved,
  };
}

export const CreativeDetailedStoryHumanNormalizationRuntime = {
  async run({
    organization_id,
    creative_project_id,
    final_targeted_result,
    normalization_directives,
  } = {}) {
    if (!organization_id) {
      throw runtimeError("organization_id required");
    }
    if (!creative_project_id) {
      throw runtimeError("creative_project_id required");
    }

    const source = object(final_targeted_result);

    if (!source.preview_only || !source.repair_only) {
      throw runtimeError(
        "CREATIVE_FINAL_TARGETED_RESULT_REQUIRED",
      );
    }
    if (
      String(source.organization_id || "") !==
      String(organization_id)
    ) {
      throw runtimeError(
        "CREATIVE_HUMAN_NORMALIZATION_ORGANIZATION_MISMATCH",
      );
    }
    if (
      String(source.creative_project_id || "") !==
      String(creative_project_id)
    ) {
      throw runtimeError(
        "CREATIVE_HUMAN_NORMALIZATION_PROJECT_MISMATCH",
      );
    }

    const sourceMap = storyShotMap(source.story);
    const directives = list(normalization_directives)
      .map((directive) => validateDirective(directive, sourceMap));

    if (!directives.length) {
      throw runtimeError(
        "CREATIVE_HUMAN_NORMALIZATION_DIRECTIVES_REQUIRED",
      );
    }

    const normalized = applyDirectives(
      source.story,
      directives,
    );
    const candidate = {
      ...source,
      success: false,
      preview_only: true,
      repair_only: true,
      preview_version: RUNTIME_VERSION,
      story: normalized.story,
    };
    const finalValidation =
      await CreativeDetailedStorySemanticRevalidationRuntimeV5.run({
        organization_id,
        creative_project_id,
        repaired_result: candidate,
      });
    const validationPassed = finalValidation.success === true;
    const approvalCandidateHash = validationPassed
      ? hash(candidate.story)
      : null;

    return {
      ...candidate,
      success: validationPassed,
      human_normalization: {
        version: RUNTIME_VERSION,
        target_keys: directives.map((item) => item.key),
        target_count: directives.length,
        preserved_shot_count:
          normalized.preserved_shot_keys.length,
        preserved_shot_keys:
          normalized.preserved_shot_keys,
        validation_passed: validationPassed,
        approval_candidate_hash: approvalCandidateHash,
      },
      final_revalidation: finalValidation,
      media_generation_dispatched: false,
      image_generation_dispatched: false,
      video_generation_dispatched: false,
      production_tasks_created: 0,
      assets_created: 0,
      next_gate: validationPassed
        ? "DETAILED_STORY_HUMAN_APPROVAL_REQUIRED"
        : "DETAILED_STORY_MANUAL_REVIEW_REQUIRED",
    };
  },
};
