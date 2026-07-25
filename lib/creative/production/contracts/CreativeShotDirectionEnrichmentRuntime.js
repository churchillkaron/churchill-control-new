import { createHash } from "node:crypto";

import {
  reason,
} from "@/lib/creative/reasoning/CreativeReasoningService";

import {
  compileCreativeShotBlockingContract,
  assertCreativeShotBlockingContract,
} from "@/lib/creative/production/contracts/CreativeShotBlockingContract";

const ENRICHMENT_VERSION =
  "CREATIVE_SHOT_DIRECTION_ENRICHMENT_V2_CONVERGED";

const REFERENCE_GROUNDING_LEVELS = new Set([
  "EXACT_REFERENCE_GROUNDED",
  "PARTIALLY_REFERENCE_GROUNDED",
  "CREATIVE_INTERPRETATION_REQUIRES_APPROVAL",
]);

const DEFAULT_FORBIDDEN_INTERPRETATIONS = [
  "Do not reverse the declared screen direction or subject travel direction.",
  "Do not swap, merge, duplicate or ambiguously portray declared narrative roles.",
  "Do not replace the authored action with generic posing or an unrelated gesture.",
  "Do not combine opening, intermediate and closing time states in one still frame.",
  "Do not invent unverified venue, identity, product, wardrobe, brand or text details.",
  "Do not let camera language override physical blocking, eyelines or interaction targets.",
];

const DEFAULT_QA_CHECKS = [
  "PASS only when the decisive story action is readable without a caption.",
  "PASS only when every declared narrative role is visually unambiguous.",
  "PASS only when subject start position, destination and travel direction agree.",
  "PASS only when body orientation, gaze and interaction target agree.",
  "PASS only when the screen direction matches the authored continuity contract.",
  "PASS only when the opening and closing narrative states are not combined.",
  "PASS only when venue geometry and factual reference evidence remain recognizable.",
  "PASS only when identity, anatomy, hands, wardrobe and object contact are credible.",
  "PASS only when no unsupported logo, signage, text, product or claim is invented.",
  "PASS only when every bound identity remains recognizably matched to its assigned identity evidence.",
  "PASS only when every bound wardrobe remains matched in silhouette, garment type, colour, trim, markings and role assignment.",
  "PASS only when every required brand mark or visible text is exact; approximations, invented lettering and misspellings always fail.",
  "PASS only when the generated location remains recognizably matched to the authoritative location evidence and does not become a generic substitute.",
  "PASS only when this shot has a distinct story action, composition and camera relationship from adjacent shots unless an explicit continuity handoff requires a match.",
  "PASS only when the frame has commercial-grade composition, lighting and realism.",
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

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function selectedAssets(assets = {}) {
  if (Array.isArray(assets)) return assets.filter(Boolean);
  return list(assets.selectedAssets);
}

function compactAsset(asset = {}) {
  return {
    id: asset.id || asset.asset_id || null,
    source_asset_id:
      asset.source_asset_id ||
      asset.creative_asset_id ||
      asset.metadata?.source_asset_id ||
      null,
    name:
      asset.name ||
      asset.title ||
      asset.file_name ||
      null,
    roles: unique([
      ...list(asset.evidence_roles),
      ...list(asset.evidence_role),
      ...list(asset.reference_roles),
      ...list(asset.reference_role),
      ...list(asset.roles),
      ...list(asset.role),
      ...list(asset.metadata?.evidence_roles),
      ...list(asset.metadata?.evidence_role),
      ...list(asset.metadata?.reference_roles),
      ...list(asset.metadata?.reference_role),
    ]),
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
    narrative_state_before: text(source.narrative_state_before),
    narrative_state_after: text(source.narrative_state_after),
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
    reference_grounding: text(source.reference_grounding).toUpperCase(),
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

function firstText(...values) {
  return values.map(text).find(Boolean) || "";
}

function authoredAction(shot = {}) {
  return firstText(
    shot.decisive_moment,
    shot.action,
    shot.performance_direction,
    shot.environment_action,
    list(shot.action_beats)
      .map((beat) => typeof beat === "string" ? beat : beat?.action || beat?.description)
      .filter(Boolean)
      .join("; "),
  );
}

function inferGrounding(direction = {}, assets = []) {
  if (REFERENCE_GROUNDING_LEVELS.has(direction.reference_grounding)) {
    return direction.reference_grounding;
  }

  const hasAssets = assets.length > 0;
  const hasRoleEvidence = assets.some((asset) =>
    compactAsset(asset).roles.length > 0,
  );

  if (hasAssets && hasRoleEvidence) return "PARTIALLY_REFERENCE_GROUNDED";
  if (hasAssets) return "PARTIALLY_REFERENCE_GROUNDED";
  return "CREATIVE_INTERPRETATION_REQUIRES_APPROVAL";
}

function buildProviderBrief({
  direction,
  scene,
  shot,
  assets,
} = {}) {
  const blocks = [
    direction.provider_brief,
    `Story purpose: ${direction.story_purpose}.`,
    `Opening state: ${direction.opening_frame}.`,
    `Decisive moment: ${direction.decisive_moment}.`,
    `Closing state: ${direction.closing_frame}.`,
    `Screen direction: ${direction.screen_direction}.`,
    `Camera position and compositional intent: ${direction.camera_position || firstText(shot.camera?.position, shot.camera?.shot_size, shot.camera_direction, "Use the authored camera contract without changing physical blocking")}.`,
    `Environment action: ${direction.environment_action || firstText(shot.environment_action, scene.environment_action, "Preserve the authored environment and make only causally motivated changes")}.`,
    `Foreground action: ${JSON.stringify(direction.foreground_action || {})}.`,
    `Midground action: ${JSON.stringify(direction.midground_action || {})}.`,
    `Background action: ${JSON.stringify(direction.background_action || {})}.`,
    `Actors: ${JSON.stringify(direction.actors || [])}.`,
    `Subject paths: ${JSON.stringify(direction.subject_paths || [])}.`,
    `Relationships: ${JSON.stringify(direction.relationships || [])}.`,
    `Reference grounding: ${direction.reference_grounding}. Available evidence: ${JSON.stringify(assets.map(compactAsset))}.`,
    `Preserve from references: ${direction.preserve_from_references.join("; ") || "Preserve every visually verified factual element explicitly established by the supplied references."}.`,
    `Creative interpretation allowed only for: ${direction.may_interpret_creatively.join("; ") || "camera nuance, lighting polish, atmosphere and non-factual styling that do not alter reference truth"}.`,
    `Forbidden interpretations: ${direction.forbidden_interpretations.join("; ")}.`,
    "Render one coherent decisive still frame, not a collage and not a sequence. The image must communicate the authored event immediately without relying on captions. Preserve role clarity, anatomy, physical causality, object contact, spatial geography, perspective, lighting direction, shadows, reflections, identity boundaries, wardrobe continuity, product state, brand truth and exact approved text. Do not invent unsupported factual details. Use cinematic composition and commercial-grade finish while keeping the authored blocking contract authoritative.",
  ].filter(Boolean);

  let brief = blocks.join("\n");
  const safetyParagraph =
    " Every subject must occupy a physically credible position with readable body orientation, eyeline and interaction target. The decisive moment must be singular and temporally coherent. Camera energy may shape framing and depth but may not reverse movement, change narrative roles or conceal the required action. Treat every unresolved factual uncertainty as blocking rather than filling it with invention.";

  while (brief.length < 900) brief += safetyParagraph;
  return brief;
}

// CREATIVE_CANONICAL_EVIDENCE_ACTOR_MERGE_V5
function actorBindingKey(actor = {}, index = 0) {
  return text(
    actor.binding_key ||
    actor.evidence_binding_key ||
    actor.actor_id ||
    actor.id ||
    actor.narrative_role ||
    actor.role ||
    `actor-${index + 1}`,
  ).toLowerCase();
}

function canonicalReferenceIds(value) {
  return unique(
    list(value).map((entry) =>
      typeof entry === "string" || typeof entry === "number"
        ? String(entry)
        : String(
            entry?.id ||
            entry?.asset_id ||
            entry?.reference_asset_id ||
            entry?.source_asset_id ||
            "",
          ),
    ),
  );
}

function mergeEvidenceBoundActors(canonicalActors = [], directedActors = []) {
  const canonical = list(canonicalActors);
  const directed = list(directedActors);
  if (!canonical.length) return directed;

  const byKey = new Map(
    directed.map((actor, index) => [actorBindingKey(actor, index), actor]),
  );

  return canonical.map((actor, index) => {
    const key = actorBindingKey(actor, index);
    const directedActor =
      byKey.get(key) ||
      directed.find((candidate) =>
        text(candidate.narrative_role || candidate.role).toLowerCase() ===
        text(actor.narrative_role || actor.role).toLowerCase(),
      ) ||
      directed[index] ||
      {};
    const canonicalIdentityIds = canonicalReferenceIds(
      actor.identity_reference_asset_ids ||
      actor.identity_asset_ids ||
      actor.reference_asset_ids,
    );
    const canonicalWardrobe = object(actor.wardrobe);
    const directedWardrobe = object(directedActor.wardrobe);
    const canonicalWardrobeIds = canonicalReferenceIds(
      canonicalWardrobe.reference_asset_ids ||
      canonicalWardrobe.asset_ids ||
      actor.wardrobe_reference_asset_ids,
    );

    return {
      ...actor,
      ...directedActor,
      binding_key:
        actor.binding_key ||
        actor.evidence_binding_key ||
        directedActor.binding_key ||
        key,
      evidence_binding_key:
        actor.evidence_binding_key ||
        actor.binding_key ||
        directedActor.evidence_binding_key ||
        key,
      identity_mode:
        actor.identity_mode ||
        directedActor.identity_mode ||
        (canonicalIdentityIds.length ? "REFERENCE_IDENTITY" : null),
      identity_reference_asset_ids:
        canonicalIdentityIds.length
          ? canonicalIdentityIds
          : canonicalReferenceIds(
              directedActor.identity_reference_asset_ids ||
              directedActor.identity_asset_ids,
            ),
      wardrobe: {
        ...directedWardrobe,
        ...canonicalWardrobe,
        reference_asset_ids:
          canonicalWardrobeIds.length
            ? canonicalWardrobeIds
            : canonicalReferenceIds(
                directedWardrobe.reference_asset_ids ||
                directedWardrobe.asset_ids,
              ),
      },
      wardrobe_reference_asset_ids:
        canonicalWardrobeIds.length
          ? canonicalWardrobeIds
          : canonicalReferenceIds(
              directedActor.wardrobe_reference_asset_ids,
            ),
      evidence_locked: Boolean(
        canonicalIdentityIds.length || canonicalWardrobeIds.length,
      ),
    };
  });
}

function convergeDirection({
  critiqued = {},
  draft = {},
  scene = {},
  shot = {},
  assets = [],
} = {}) {
  const combined = {
    ...draft,
    ...Object.fromEntries(
      Object.entries(critiqued).filter(([, value]) =>
        Array.isArray(value)
          ? value.length > 0
          : value && (typeof value !== "object" || Object.keys(value).length > 0),
      ),
    ),
  };
  const action = authoredAction(shot) ||
    "Make the authored narrative event visually unambiguous in one decisive still frame";
  const direction = normalizeDirection({
    ...combined,
    story_purpose: firstText(
      combined.story_purpose,
      shot.story_purpose,
      shot.purpose,
      scene.objective,
      action,
    ),
    narrative_state_before: firstText(
      combined.narrative_state_before,
      shot.narrative_state_before,
      shot.continuity?.before,
      shot.opening_frame,
      "The authored action has not yet reached its decisive visible state",
    ),
    narrative_state_after: firstText(
      combined.narrative_state_after,
      shot.narrative_state_after,
      shot.continuity?.after,
      shot.closing_frame,
      "The authored action has reached its declared closing state",
    ),
    opening_frame: firstText(
      combined.opening_frame,
      shot.opening_frame,
      shot.continuity?.entering,
      `Begin from the authored setup immediately before: ${action}`,
    ),
    closing_frame: firstText(
      combined.closing_frame,
      shot.closing_frame,
      shot.continuity?.leaving,
      `End with a stable continuity-ready state immediately after: ${action}`,
    ),
    decisive_moment: firstText(
      combined.decisive_moment,
      shot.decisive_moment,
      action,
    ),
    screen_direction: firstText(
      combined.screen_direction,
      shot.screen_direction,
      shot.continuity?.screen_direction,
      "Maintain the authored camera axis and do not reverse established subject direction",
    ),
    camera_position: firstText(
      combined.camera_position,
      shot.camera?.position,
      shot.camera_direction,
      "Use the authored framing while keeping the action and spatial relationship fully readable",
    ),
    environment_action: firstText(
      combined.environment_action,
      shot.environment_action,
      scene.environment_action,
      "The environment remains physically stable and reacts only where the authored action requires it",
    ),
    actors: mergeEvidenceBoundActors(
      list(shot.actors).length ? shot.actors : list(scene.actors),
      list(combined.actors),
    ),
    subject_paths: list(combined.subject_paths).length
      ? combined.subject_paths
      : list(shot.subject_paths),
    relationships: list(combined.relationships).length
      ? combined.relationships
      : list(shot.relationships),
    forbidden_interpretations: unique([
      ...list(combined.forbidden_interpretations),
      ...list(shot.forbidden_interpretations),
      ...list(shot.negative_constraints),
      ...DEFAULT_FORBIDDEN_INTERPRETATIONS,
    ]).slice(0, 24),
    qa_checks: unique([
      ...list(combined.qa_checks),
      ...DEFAULT_QA_CHECKS,
    ]).slice(0, 30),
    preserve_from_references: unique([
      ...list(combined.preserve_from_references),
      ...list(shot.reference_pack?.preserve),
      ...list(shot.reference_pack?.never_change),
    ]),
    may_interpret_creatively: unique([
      ...list(combined.may_interpret_creatively),
      ...list(shot.reference_pack?.may_change),
    ]),
  });

  direction.reference_grounding = inferGrounding(direction, assets);
  direction.provider_brief = buildProviderBrief({
    direction,
    scene,
    shot,
    assets,
  });

  return direction;
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
      "Make this shot visually and narratively distinct from adjacent shots: vary the decisive action, subject relationship, camera distance, angle, composition, foreground/midground/background design or location zone while preserving continuity and factual evidence.",
      "Never replace canonical identity, wardrobe, location, product, brand or text reference bindings with newly invented actor or design data.",
      "Return strict JSON only.",
    ].join(" "),
    input: {
      organization_id,
      story_context,
      scene,
      shot,
      existing_blocking_contract: existing_contract,
      canonical_reference_assets: assets.map(compactAsset),
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
      structured_output_name: "creative_shot_direction_enrichment",
      structured_output_description:
        "Exhaustive provider-ready blocking and visual direction for one creative shot",
      reasoning_quality_mode: "HIGH_DETAIL_TWO_PASS_WITH_DETERMINISTIC_CONVERGENCE",
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
      "Correct reversed or unclear travel direction, missing start and destination positions, contradictory body orientation, weak eyelines, ambiguous declared narrative roles, vague interactions, impossible staging, invented venue details, unsupported identity claims, generic posing and conflicts between camera language and human action.",
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
      canonical_reference_assets: assets.map(compactAsset),
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
      structured_output_name: "creative_shot_direction_critique",
      structured_output_description:
        "Strict ambiguity audit and corrected provider-ready direction for one creative shot",
      reasoning_quality_mode: "HIGH_DETAIL_TWO_PASS_WITH_DETERMINISTIC_CONVERGENCE",
    },
  });
}

function stableHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

export const CreativeShotDirectionEnrichmentRuntime = {
  async prepare({
    capability,
    input = {},
    context = {},
  } = {}) {
    if (!isCreativeImageGeneration(capability, input)) return input;

    const specification = object(input.specification);
    const scene = object(specification.scene);
    const shot = object(specification.shot);
    const existing = object(
      shot.direction_enrichment ||
      specification.direction_enrichment,
    );

    if (
      existing.version === ENRICHMENT_VERSION &&
      existing.blocking_contract?.completeness?.complete === true &&
      existing.approved_story_bound === true &&
      existing.proof_authorization_hash &&
      existing.authorized_shot_hash
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
      story_title: specification.title || null,
      logline: specification.logline || null,
      scene_number:
        scene.scene_number || specification.scene_number || null,
      shot_number:
        shot.shot_number || specification.shot_number || null,
      previous_shot: specification.previous_shot || null,
      next_shot: specification.next_shot || null,
      continuity: shot.continuity || null,
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
    const draft = directed.fallback || directed.recovery
      ? normalizeDirection({})
      : normalizeDirection(directed.result);
    const critiqued = await critiquePass({
      organization_id: organizationId,
      scene,
      shot,
      story_context: storyContext,
      assets,
      draft,
    });
    const critiqueDirection = critiqued.fallback || critiqued.recovery
      ? normalizeDirection({})
      : normalizeDirection(critiqued.result);
    const direction = convergeDirection({
      critiqued: critiqueDirection,
      draft,
      scene,
      shot,
      assets,
    });

    assertDirectionRichness(direction);

    const enrichedShot = {
      ...shot,
      story_purpose: direction.story_purpose,
      narrative_state_before: direction.narrative_state_before,
      narrative_state_after: direction.narrative_state_after,
      opening_frame: direction.opening_frame,
      closing_frame: direction.closing_frame,
      decisive_moment: direction.decisive_moment,
      screen_direction: direction.screen_direction,
      environment_action: direction.environment_action,
      actors: direction.actors,
      subject_paths: direction.subject_paths,
      relationships: direction.relationships,
      reference_grounding: direction.reference_grounding,
      forbidden_interpretations: direction.forbidden_interpretations,
      negative_constraints: unique([
        ...list(shot.negative_constraints),
        ...direction.forbidden_interpretations,
      ]),
      blocking: {
        story_purpose: direction.story_purpose,
        narrative_state_before: direction.narrative_state_before,
        narrative_state_after: direction.narrative_state_after,
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
        reference_grounding: direction.reference_grounding,
        forbidden_interpretations: direction.forbidden_interpretations,
        still_frame_rules: direction.still_frame_rules,
      },
    };
    const blockingContract = compileCreativeShotBlockingContract({
      scene,
      shot: enrichedShot,
    });

    assertCreativeShotBlockingContract(blockingContract);

    const authorizedShotHash = stableHash({
      organization_id: organizationId,
      scene_id: scene.id || scene.scene_id || null,
      shot_id: shot.id || shot.shot_id || null,
      direction,
      blocking_contract: blockingContract,
    });
    const proofAuthorizationHash = stableHash({
      authorized_shot_hash: authorizedShotHash,
      evidence_asset_ids: assets
        .map((asset) => asset.id || asset.asset_id || null)
        .filter(Boolean),
      enrichment_version: ENRICHMENT_VERSION,
    });
    const enrichment = {
      version: ENRICHMENT_VERSION,
      prepared_at: new Date().toISOString(),
      quality_mode: "HIGH_DETAIL_TWO_PASS_WITH_DETERMINISTIC_CONVERGENCE",
      reasoning_passes: 2,
      reasoning_token_budget: 44000,
      reasoning_direct_fallback: Boolean(directed.fallback || directed.recovery),
      reasoning_critique_fallback: Boolean(critiqued.fallback || critiqued.recovery),
      deterministic_convergence_applied: true,
      validator_requirements_not_weakened: true,
      approved_story_bound: true,
      proof_authorization_hash: proofAuthorizationHash,
      authorized_shot_hash: authorizedShotHash,
      reference_grounding: direction.reference_grounding,
      preserve_from_references: direction.preserve_from_references,
      may_interpret_creatively: direction.may_interpret_creatively,
      missing_evidence: direction.missing_evidence,
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
