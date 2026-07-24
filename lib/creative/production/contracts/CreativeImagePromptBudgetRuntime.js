const DEFAULT_PROMPT_BUDGET = 7000;
const PROVIDER_HARD_LIMIT = 32000;
const RESERVED_PROVIDER_WRAPPER = 22000;

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
  return String(value || "").replace(/\s+/g, " ").trim();
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function clip(value, maximum) {
  const normalized = text(value);
  if (!normalized || normalized.length <= maximum) return normalized;
  return `${normalized.slice(0, Math.max(0, maximum - 3)).trim()}...`;
}

function clipList(value, maximumItems = 12, maximumCharacters = 280) {
  return unique(list(value).map((item) =>
    clip(
      typeof item === "string"
        ? item
        : JSON.stringify(item || {}),
      maximumCharacters,
    ),
  )).slice(0, maximumItems);
}

function compactStructured(value, maximumCharacters = 1800) {
  if (!value) return null;
  const serialized = JSON.stringify(value);
  if (serialized.length <= maximumCharacters) return value;

  return {
    compacted: true,
    summary: clip(serialized, maximumCharacters),
  };
}

function compactActor(actor = {}, index = 0) {
  const blocking = object(actor.blocking || actor.performance_blocking);

  return {
    actor_id: actor.actor_id || actor.id || `actor_${index + 1}`,
    narrative_role:
      actor.narrative_role ||
      actor.role ||
      actor.character ||
      actor.name ||
      null,
    count: Number(actor.count || actor.quantity || 1),
    identity_mode: actor.identity_mode || actor.identityMode || null,
    identity_reference_asset_ids: clipList(
      actor.identity_reference_asset_ids ||
      actor.reference_asset_ids ||
      actor.identity_reference_asset_id ||
      actor.reference_asset_id,
      6,
      120,
    ),
    wardrobe: compactStructured(
      actor.wardrobe || actor.costume || actor.styling,
      500,
    ),
    action: clip(
      actor.action ||
      actor.visible_action ||
      actor.performance_action ||
      blocking.action,
      420,
    ) || null,
    start_position: clip(
      actor.start_position ||
      actor.starting_position ||
      actor.position ||
      blocking.start_position ||
      blocking.starting_position,
      300,
    ) || null,
    end_position: clip(
      actor.end_position ||
      actor.destination ||
      blocking.end_position,
      300,
    ) || null,
    travel_direction: clip(
      actor.travel_direction ||
      actor.movement_direction ||
      blocking.travel_direction,
      240,
    ) || null,
    body_orientation: clip(
      actor.body_orientation ||
      actor.orientation ||
      actor.facing ||
      blocking.body_orientation,
      240,
    ) || null,
    gaze_target: clip(
      actor.gaze_target ||
      actor.eyeline ||
      actor.looks_at ||
      blocking.gaze_target,
      240,
    ) || null,
    interaction_target: clip(
      actor.interaction_target ||
      actor.interacts_with ||
      blocking.interaction_target,
      240,
    ) || null,
    expression: clip(
      actor.expression ||
      actor.emotional_read ||
      blocking.expression,
      240,
    ) || null,
  };
}

function compactReferencePack(referencePack = {}) {
  return {
    required: referencePack.required === true,
    exact_location_required:
      referencePack.exact_location_required === true,
    exact_brand_required:
      referencePack.exact_brand_required === true,
    asset_ids: clipList(
      referencePack.asset_ids || referencePack.reference_asset_ids,
      8,
      120,
    ),
    location_asset_ids: clipList(
      referencePack.location_asset_ids,
      6,
      120,
    ),
    brand_asset_ids: clipList(
      referencePack.brand_asset_ids,
      6,
      120,
    ),
    preserve: clipList(referencePack.preserve, 10, 260),
    may_change: clipList(referencePack.may_change, 10, 260),
    never_change: clipList(referencePack.never_change, 10, 260),
  };
}

function compactScene(scene = {}) {
  return {
    scene_number: scene.scene_number || null,
    title: clip(scene.title || scene.name, 240) || null,
    objective: clip(scene.objective || scene.purpose, 600) || null,
    emotion: clip(
      scene.emotion ||
      scene.emotional_function ||
      scene.emotional_goal,
      360,
    ) || null,
    location: compactStructured(scene.location, 700),
    actors: list(scene.actors).slice(0, 8).map(compactActor),
    continuity: compactStructured(scene.continuity, 700),
    reference_pack: compactReferencePack(scene.reference_pack || {}),
    evidence_requirements: compactStructured(
      scene.evidence_requirements,
      600,
    ),
  };
}

function compactShot(shot = {}) {
  return {
    ...shot,
    title: clip(shot.title || shot.name, 260) || null,
    purpose: clip(shot.purpose || shot.objective, 700) || null,
    opening_frame: clip(
      shot.opening_frame || shot.opening_state || shot.frame_zero_description,
      700,
    ) || null,
    closing_frame: clip(
      shot.closing_frame || shot.closing_state || shot.end_frame,
      700,
    ) || null,
    decisive_moment: clip(shot.decisive_moment, 700) || null,
    action_beats: clipList(shot.action_beats, 12, 360),
    performance_direction: clip(shot.performance_direction, 1400) || null,
    camera: compactStructured(
      shot.camera || shot.cinematography || shot.camera_contract,
      1300,
    ),
    lighting: compactStructured(
      shot.lighting || shot.lighting_contract,
      1100,
    ),
    actors: list(shot.actors).slice(0, 8).map(compactActor),
    products: list(shot.products).slice(0, 8).map((product) => ({
      name: clip(product?.name || product?.title || product?.description, 240),
      reference_asset_ids: clipList(
        product?.reference_asset_ids ||
        product?.asset_ids ||
        product?.reference_asset_id ||
        product?.asset_id,
        4,
        120,
      ),
      exact: product?.exact === true || product?.reference_required === true,
    })),
    location: compactStructured(shot.location, 700),
    continuity: compactStructured(shot.continuity, 900),
    reality_rules: {
      human: clipList(shot.reality_rules?.human, 8, 260),
      physical: clipList(shot.reality_rules?.physical, 8, 260),
      environment: clipList(shot.reality_rules?.environment, 8, 260),
    },
    composition_plan: compactStructured(shot.composition_plan, 900),
    reference_pack: compactReferencePack(shot.reference_pack || {}),
    quality_requirements: compactStructured(
      shot.quality_requirements,
      2200,
    ),
    negative_constraints: clipList(
      shot.negative_constraints || shot.failure_prevention,
      14,
      300,
    ),
    failure_prevention: clipList(
      shot.failure_prevention || shot.negative_constraints,
      14,
      300,
    ),
    direction_enrichment: undefined,
    blocking_contract: undefined,
    temporal_contract: undefined,
  };
}

function compactEvidenceManifest(manifest = {}) {
  return {
    version: manifest.version || null,
    required_roles: clipList(manifest.required_roles, 10, 80),
    generated_roles: clipList(manifest.generated_roles, 10, 80),
    authoritative_source_asset_id:
      manifest.authoritative_source_asset_id || null,
    bindings: list(manifest.bindings).slice(0, 10).map((binding) => ({
      role: binding.role || null,
      selected_asset_ids: clipList(binding.selected_asset_ids, 6, 120),
      approved_selected_asset_ids: clipList(
        binding.approved_selected_asset_ids,
        6,
        120,
      ),
      exact_fidelity_required:
        binding.exact_fidelity_required === true,
      authoritative_source_required:
        binding.authoritative_source_required === true,
    })),
  };
}

function compactDirection(input = {}) {
  const direction =
    input.direction_enrichment ||
    input.specification?.direction_enrichment ||
    input.specification?.shot?.direction_enrichment ||
    {};

  return {
    version: direction.version || null,
    approved_story_bound: direction.approved_story_bound === true,
    proof_authorization_hash: direction.proof_authorization_hash || null,
    authorized_shot_hash: direction.authorized_shot_hash || null,
    reference_grounding: direction.reference_grounding || null,
    provider_brief: clip(direction.provider_brief, 3200),
    preserve_from_references: clipList(
      direction.preserve_from_references,
      12,
      240,
    ),
    may_interpret_creatively: clipList(
      direction.may_interpret_creatively,
      12,
      240,
    ),
    missing_evidence: clipList(direction.missing_evidence, 10, 220),
    qa_checks: clipList(direction.qa_checks, 16, 260),
  };
}

function buildPrompt(input = {}, maximumCharacters = DEFAULT_PROMPT_BUDGET) {
  const direction = compactDirection(input);
  const blocking =
    input.blocking_contract ||
    input.specification?.blocking_contract ||
    input.specification?.shot?.blocking_contract ||
    {};
  const evidence =
    input.evidence_role_manifest ||
    input.generation_contract?.evidence_role_manifest ||
    {};
  const original = String(input.prompt || "");
  const sections = [
    "AVANTIQO CREATIVE MASTER-STILL EXECUTION BRIEF",
    clip(original, 1200),
    direction.proof_authorization_hash
      ? `APPROVED DIRECTION HASHES: proof=${direction.proof_authorization_hash}; shot=${direction.authorized_shot_hash || "missing"}`
      : "The structured shot and evidence contracts supplied with this request are authoritative.",
    direction.provider_brief
      ? `DIRECTOR PROVIDER BRIEF:\n${direction.provider_brief}`
      : "",
    `REFERENCE GROUNDING:\n${JSON.stringify({
      reference_grounding: direction.reference_grounding,
      preserve_from_references: direction.preserve_from_references,
      may_interpret_creatively: direction.may_interpret_creatively,
      missing_evidence: direction.missing_evidence,
      evidence: compactEvidenceManifest(evidence),
    })}`,
    `SHOT BLOCKING:\n${clip(JSON.stringify(blocking || {}), 1700)}`,
    direction.qa_checks.length
      ? `BINARY QA CHECKS:\n${JSON.stringify(direction.qa_checks)}`
      : "",
    "Generate one coherent photorealistic commercial frame. Preserve approved evidence and factual invariants. Keep roles, action, body orientation, gaze, interaction, screen direction, architecture, product geometry, wardrobe, lighting, perspective, shadows, reflections and continuity internally consistent. Do not invent unsupported people, identities, venue details, text, logos, products, claims or events. Do not reverse the action, combine multiple time states, produce a collage, or substitute generic posing for the required story event.",
  ].filter(Boolean);
  let prompt = sections.join("\n\n");

  if (prompt.length > maximumCharacters) {
    prompt = `${prompt.slice(0, Math.max(0, maximumCharacters - 160)).trim()}\n\n[Prompt compacted at the provider boundary. The structured specification, attached references and hash-bound contracts remain authoritative.]`;
  }

  return prompt;
}

export const CreativeImagePromptBudgetRuntime = {
  prepare({
    capability,
    input = {},
    maximum_prompt_characters = DEFAULT_PROMPT_BUDGET,
  } = {}) {
    if (capability !== "ai.image.generate") return input;

    const specification = object(input.specification);
    const originalPrompt = String(input.prompt || "");
    const prompt = buildPrompt(input, maximum_prompt_characters);
    const compactedScene = compactScene(specification.scene || {});
    const compactedShot = compactShot(specification.shot || {});

    return {
      ...input,
      prompt,
      specification: {
        ...specification,
        scene: compactedScene,
        shot: compactedShot,
        quality_corrections: clipList(
          specification.quality_corrections,
          10,
          260,
        ),
        direction_enrichment: undefined,
        blocking_contract: undefined,
      },
      prompt_contract: {
        ...(input.prompt_contract || {}),
        budget_runtime: "CREATIVE_IMAGE_PROMPT_BUDGET_V1",
        original_prompt_characters: originalPrompt.length,
        compacted_prompt_characters: prompt.length,
        maximum_pre_provider_characters: maximum_prompt_characters,
        reserved_provider_wrapper_characters:
          RESERVED_PROVIDER_WRAPPER,
        provider_hard_limit_characters: PROVIDER_HARD_LIMIT,
        structured_specification_compacted: true,
        evidence_or_quality_gate_weakened: false,
      },
    };
  },
};
