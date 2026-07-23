import {
  reason,
} from "@/lib/creative/reasoning/CreativeReasoningService";

import {
  compileCreativeShotBlockingContract,
  assertCreativeShotBlockingContract,
} from "@/lib/creative/production/contracts/CreativeShotBlockingContract";

const ENRICHMENT_VERSION =
  "CREATIVE_SHOT_DIRECTION_ENRICHMENT_V1";

const REFERENCE_GROUNDING_LEVELS = new Set([
  "EXACT_REFERENCE_GROUNDED",
  "PARTIALLY_REFERENCE_GROUNDED",
  "CREATIVE_INTERPRETATION_REQUIRES_APPROVAL",
]);

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

function selectedAssets(assets = {}) {
  if (Array.isArray(assets)) return assets.filter(Boolean);
  return list(assets.selectedAssets);
}

function compactAsset(asset = {}) {
  return {
    id: asset.id || asset.asset_id || null,
    name:
      asset.name ||
      asset.title ||
      asset.file_name ||
      null,
    roles: [
      ...list(asset.reference_roles),
      ...list(asset.reference_role),
      ...list(asset.roles),
      ...list(asset.role),
      ...list(asset.metadata?.reference_roles),
      ...list(asset.metadata?.reference_role),
    ],
    tags: list(asset.tags).slice(0, 24),
    description:
      asset.description ||
      asset.caption ||
      asset.analysis?.summary ||
      null,
  };
}

function isCreativeImageGeneration(capability, input = {}) {
  return (
    capability === "ai.image.generate" &&
    Boolean(
      input.production_task_id ||
      input.specification?.shot ||
      input.generation_contract ||
      String(input.mode || "").startsWith("creative_") ||
      [
        "reference_grounded_master_still",
        "reference_grounded_full_scene_synthesis",
      ].includes(String(input.mode || "")),
    )
  );
}

const DIRECTION_OUTPUT_SHAPE = {
  result: {
    story_purpose: "string",
    narrative_state_before: "string",
    narrative_state_after: "string",
    opening_frame: "string",
    closing_frame: "string",
    decisive_moment: "string",
    screen_direction: "string",
    camera_position: "string",
    environment_action: "string",
    foreground_action: "object",
    midground_action: "object",
    background_action: "object",
    actors: [
      {
        actor_id: "string",
        narrative_role: "string",
        count: "number",
        action: "string",
        start_position: "string",
        end_position: "string",
        travel_direction: "string",
        body_orientation: "string",
        gaze_target: "string",
        interaction_target: "string",
        expression: "string",
        wardrobe: "object",
        identity_reference_asset_ids: ["string"],
        must_be_visually_identifiable: "boolean",
      },
    ],
    subject_paths: [
      {
        subject: "string",
        action: "string",
        start_position: "string",
        end_position: "string",
        travel_direction: "string",
        body_orientation: "string",
        gaze_target: "string",
        interaction_target: "string",
        expression: "string",
        must_be_visually_identifiable: "boolean",
      },
    ],
    relationships: ["object"],
    reference_grounding: "string",
    preserve_from_references: ["string"],
    may_interpret_creatively: ["string"],
    missing_evidence: ["string"],
    forbidden_interpretations: ["string"],
    still_frame_rules: ["string"],
    provider_brief: "string",
    qa_checks: ["string"],
    assumptions: ["string"],
  },
};

function reasoningFailure(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function normalizeDirection(result = {}) {
  const source = object(result);

  return {
    story_purpose: text(source.story_purpose),
    narrative_state_before:
      text(source.narrative_state_before),
    narrative_state_after:
      text(source.narrative_state_after),
    opening_frame: text(source.opening_frame),
    closing_frame: text(source.closing_frame),
    decisive_moment: text(source.decisive_moment),
    screen_direction: text(source.screen_direction),
    camera_position: text(source.camera_position),
    environment_action: text(source.environment_action),
    foreground_action: object(source.foreground_action),
    midground_action: object(source.midground_action),
    background_action: object(source.background_action),
    actors: list(source.actors),
    subject_paths: list(source.subject_paths),
    relationships: list(source.relationships),
    reference_grounding:
      text(source.reference_grounding).toUpperCase(),
    preserve_from_references:
      list(source.preserve_from_references).map(text).filter(Boolean),
    may_interpret_creatively:
      list(source.may_interpret_creatively).map(text).filter(Boolean),
    missing_evidence:
      list(source.missing_evidence).map(text).filter(Boolean),
    forbidden_interpretations:
      list(source.forbidden_interpretations).map(text).filter(Boolean),
    still_frame_rules:
      list(source.still_frame_rules).map(text).filter(Boolean),
    provider_brief: text(source.provider_brief),
    qa_checks: list(source.qa_checks).map(text).filter(Boolean),
    assumptions: list(source.assumptions).map(text).filter(Boolean),
  };
}

function assertDirectionRichness(direction = {}) {
  const missing = [];

  if (!REFERENCE_GROUNDING_LEVELS.has(direction.reference_grounding)) {
    missing.push("reference_grounding");
  }
  if (direction.provider_brief.length < 900) {
    missing.push("provider_brief_minimum_900_characters");
  }
  if (direction.forbidden_interpretations.length < 6) {
    missing.push("minimum_6_forbidden_interpretations");
  }
  if (direction.qa_checks.length < 10) {
    missing.push("minimum_10_qa_checks");
  }
  if (!direction.story_purpose) missing.push("story_purpose");
  if (!direction.opening_frame) missing.push("opening_frame");
  if (!direction.closing_frame) missing.push("closing_frame");
  if (!direction.decisive_moment) missing.push("decisive_moment");
  if (!direction.screen_direction) missing.push("screen_direction");

  if (missing.length) {
    throw reasoningFailure(
      "CREATIVE_SHOT_DIRECTION_ENRICHMENT_INSUFFICIENT",
      { missing },
    );
  }
}

async function directPass({
  organization_id,
  scene,
  shot,
  story_context,
  assets,
  existing_contract,
}) {
  return reason({
    task: [
      "Act as a world-class film director, blocking director, cinematographer and continuity supervisor.",
      "Convert one planned shot into an exhaustive provider-ready visual production brief before any image generation.",
      "Describe only what can be visibly verified in one decisive still frame.",
      "Make the story event unambiguous without captions.",
      "For every human or important subject define narrative role, count, visible action, start position, destination, travel direction, body orientation, gaze, interaction target, expression and relationship to other subjects.",
      "Separate foreground, midground and background action.",
      "State the narrative state before and after the shot, the opening frame, closing frame and exact decisive moment to render.",
      "Treat camera movement terminology only as compositional energy for a still; it may never replace physical subject blocking.",
      "Classify evidence as EXACT_REFERENCE_GROUNDED, PARTIALLY_REFERENCE_GROUNDED or CREATIVE_INTERPRETATION_REQUIRES_APPROVAL.",
      "Never claim exact venue, identity, product or brand fidelity when matching evidence is absent.",
      "List at least six explicit forbidden interpretations, including opposite actions and ambiguous role readings where relevant.",
      "Write a provider_brief of at least 900 characters with precise spatial, behavioral, photographic and continuity instructions.",
      "Write at least ten binary QA checks that can fail the image.",
      "Return strict JSON only.",
    ].join(" "),
    input: {
      organization_id,
      story_context,
      scene,
      shot,
      existing_blocking_contract: existing_contract,
      canonical_reference_assets:
        assets.map(compactAsset),
    },
    constraints: {
      no_generic_campaign_template: true,
      no_invented_factual_truth: true,
      exact_reference_asset_ids_only: true,
      one_decisive_still_frame: true,
      action_must_read_without_caption: true,
      camera_language_cannot_override_blocking: true,
      provider_brief_minimum_characters: 900,
      minimum_forbidden_interpretations: 6,
      minimum_qa_checks: 10,
    },
    outputShape: DIRECTION_OUTPUT_SHAPE,
    temperature: 0.45,
    maxOutputTokens: 24000,
    timeoutMs: 360000,
    metadata: {
      operation: "CREATIVE_SHOT_DIRECTION_ENRICHMENT",
      structured_output_name:
        "creative_shot_direction_enrichment",
      structured_output_description:
        "Exhaustive provider-ready blocking and visual direction for one creative shot",
      reasoning_quality_mode: "HIGH_DETAIL_TWO_PASS",
    },
  });
}

async function critiquePass({
  organization_id,
  scene,
  shot,
  story_context,
  assets,
  draft,
}) {
  return reason({
    task: [
      "Act as a strict script supervisor, production designer, casting director and visual QA architect.",
      "Audit the supplied shot direction for ambiguity that could waste an image generation.",
      "Correct reversed or unclear travel direction, missing start and destination positions, contradictory body orientation, weak eyelines, ambiguous staff/customer roles, vague interactions, impossible staging, invented venue details, unsupported identity claims, generic posing and conflicts between camera language and human action.",
      "Ensure the decisive still unmistakably communicates the intended story event.",
      "Preserve valid creativity but rewrite every vague instruction into visible and testable direction.",
      "Return the complete corrected contract, not comments or a partial patch.",
      "The provider_brief must remain at least 900 characters and QA must contain at least ten binary checks.",
      "Return strict JSON only.",
    ].join(" "),
    input: {
      organization_id,
      story_context,
      scene,
      shot,
      draft_direction: draft,
      canonical_reference_assets:
        assets.map(compactAsset),
    },
    constraints: {
      fail_ambiguity_closed: true,
      no_opposite_action_interpretation: true,
      no_role_ambiguity: true,
      no_unsupported_fidelity_claims: true,
      no_generic_posing: true,
      one_decisive_still_frame: true,
      provider_brief_minimum_characters: 900,
      minimum_forbidden_interpretations: 6,
      minimum_qa_checks: 10,
    },
    outputShape: DIRECTION_OUTPUT_SHAPE,
    temperature: 0.2,
    maxOutputTokens: 20000,
    timeoutMs: 360000,
    metadata: {
      operation: "CREATIVE_SHOT_DIRECTION_CRITIQUE",
      structured_output_name:
        "creative_shot_direction_critique",
      structured_output_description:
        "Strict ambiguity audit and corrected provider-ready direction for one creative shot",
      reasoning_quality_mode: "HIGH_DETAIL_TWO_PASS",
    },
  });
}

export const CreativeShotDirectionEnrichmentRuntime = {
  async prepare({
    capability,
    input = {},
    context = {},
  } = {}) {
    if (!isCreativeImageGeneration(capability, input)) {
      return input;
    }

    const specification = object(input.specification);
    const scene = object(specification.scene);
    const shot = object(specification.shot);
    const existing = object(
      shot.direction_enrichment ||
      specification.direction_enrichment,
    );

    if (
      existing.version === ENRICHMENT_VERSION &&
      existing.blocking_contract?.completeness?.complete === true
    ) {
      return input;
    }

    const organizationId =
      input.organization_id ||
      context.organization_id ||
      context.organizationId ||
      null;

    if (!organizationId) {
      throw reasoningFailure(
        "CREATIVE_SHOT_DIRECTION_ORGANIZATION_REQUIRED",
      );
    }

    const assets = selectedAssets(input.assets);
    const storyContext = {
      project_objective:
        specification.objective ||
        specification.project_objective ||
        null,
      story_title:
        specification.title || null,
      logline:
        specification.logline || null,
      scene_number:
        scene.scene_number ||
        specification.scene_number ||
        null,
      shot_number:
        shot.shot_number ||
        specification.shot_number ||
        null,
      previous_shot:
        specification.previous_shot || null,
      next_shot:
        specification.next_shot || null,
      continuity:
        shot.continuity || null,
    };
    const existingContract =
      compileCreativeShotBlockingContract({ scene, shot });
    const directed = await directPass({
      organization_id: organizationId,
      scene,
      shot,
      story_context: storyContext,
      assets,
      existing_contract: existingContract,
    });

    if (directed.fallback || directed.recovery) {
      throw reasoningFailure(
        "CREATIVE_SHOT_DIRECTION_REASONING_FAILED",
        {
          stage: "DIRECT",
          reason: directed.fallback_reason || null,
        },
      );
    }

    const draft = normalizeDirection(directed.result);
    const critiqued = await critiquePass({
      organization_id: organizationId,
      scene,
      shot,
      story_context: storyContext,
      assets,
      draft,
    });

    if (critiqued.fallback || critiqued.recovery) {
      throw reasoningFailure(
        "CREATIVE_SHOT_DIRECTION_REASONING_FAILED",
        {
          stage: "CRITIQUE",
          reason: critiqued.fallback_reason || null,
        },
      );
    }

    const direction = normalizeDirection(critiqued.result);
    assertDirectionRichness(direction);

    const enrichedShot = {
      ...shot,
      story_purpose: direction.story_purpose,
      narrative_state_before:
        direction.narrative_state_before,
      narrative_state_after:
        direction.narrative_state_after,
      opening_frame: direction.opening_frame,
      closing_frame: direction.closing_frame,
      decisive_moment: direction.decisive_moment,
      screen_direction: direction.screen_direction,
      environment_action: direction.environment_action,
      actors: direction.actors,
      subject_paths: direction.subject_paths,
      relationships: direction.relationships,
      reference_grounding:
        direction.reference_grounding,
      forbidden_interpretations:
        direction.forbidden_interpretations,
      negative_constraints: [
        ...list(shot.negative_constraints),
        ...direction.forbidden_interpretations,
      ],
      blocking: {
        story_purpose: direction.story_purpose,
        narrative_state_before:
          direction.narrative_state_before,
        narrative_state_after:
          direction.narrative_state_after,
        opening_frame: direction.opening_frame,
        closing_frame: direction.closing_frame,
        decisive_moment: direction.decisive_moment,
        screen_direction: direction.screen_direction,
        camera_position: direction.camera_position,
        environment_action: direction.environment_action,
        foreground_action: direction.foreground_action,
        midground_action: direction.midground_action,
        background_action: direction.background_action,
        subject_paths: direction.subject_paths,
        relationships: direction.relationships,
        reference_grounding:
          direction.reference_grounding,
        forbidden_interpretations:
          direction.forbidden_interpretations,
        still_frame_rules:
          direction.still_frame_rules,
      },
    };
    const blockingContract =
      compileCreativeShotBlockingContract({
        scene,
        shot: enrichedShot,
      });

    assertCreativeShotBlockingContract(blockingContract);

    const enrichment = {
      version: ENRICHMENT_VERSION,
      prepared_at: new Date().toISOString(),
      quality_mode: "HIGH_DETAIL_TWO_PASS",
      reasoning_passes: 2,
      reasoning_token_budget: 44000,
      reference_grounding:
        direction.reference_grounding,
      preserve_from_references:
        direction.preserve_from_references,
      may_interpret_creatively:
        direction.may_interpret_creatively,
      missing_evidence:
        direction.missing_evidence,
      assumptions: direction.assumptions,
      provider_brief: direction.provider_brief,
      qa_checks: direction.qa_checks,
      blocking_contract: blockingContract,
    };

    return {
      ...input,
      organization_id: organizationId,
      specification: {
        ...specification,
        shot: {
          ...enrichedShot,
          blocking_contract: blockingContract,
          direction_enrichment: enrichment,
        },
        blocking_contract: blockingContract,
        direction_enrichment: enrichment,
      },
      blocking_contract: blockingContract,
      direction_enrichment: enrichment,
      prompt: [
        input.prompt || "",
        "HIGH-DETAIL DIRECTOR PROVIDER BRIEF:",
        direction.provider_brief,
        "AUTHORITATIVE BINARY QA CHECKS:",
        JSON.stringify(direction.qa_checks),
      ].filter(Boolean).join("\n\n"),
    };
  },
};
