import {
  classifyCreativeEvidenceRoles,
  creativeEvidenceAssetId,
  deriveCreativeEvidenceRequirements,
} from "@/lib/creative/production/contracts/CreativeEvidenceRoleContractV2";

// CREATIVE_STORYBOARD_EVIDENCE_BINDING_V3
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
  return JSON.parse(JSON.stringify(value ?? null));
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function meaningful(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function firstMeaningful(...values) {
  return values.find(meaningful);
}

function firstList(...values) {
  return values.map(list).find((value) => value.length) || [];
}

function compactEvidence(value, fallback = "the authored shot direction") {
  const source = typeof value === "string"
    ? value
    : JSON.stringify(value || "");
  const normalized = String(source || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return fallback;
  return normalized.length > 480
    ? `${normalized.slice(0, 477)}...`
    : normalized;
}

function actorLabel(actor = {}, index = 0) {
  return text(
    actor.role ||
      actor.character ||
      actor.name ||
      actor.title ||
      actor.label,
  ) || `actor ${index + 1}`;
}

function directActorBehavior(actor = {}) {
  const blocking = {
    ...object(actor.performance),
    ...object(actor.blocking),
  };

  return {
    starting_position: firstMeaningful(
      actor.starting_position,
      actor.start_position,
      blocking.starting_position,
      blocking.start_position,
    ),
    movement_path: firstMeaningful(
      actor.movement_path,
      actor.path,
      blocking.movement_path,
      blocking.path,
    ),
    eye_line: firstMeaningful(
      actor.eye_line,
      actor.eyeline,
      blocking.eye_line,
      blocking.eyeline,
    ),
    gesture: firstMeaningful(
      actor.gesture,
      actor.gestures,
      blocking.gesture,
      blocking.gestures,
    ),
    reaction_timing: firstMeaningful(
      actor.reaction_timing,
      actor.timing,
      blocking.reaction_timing,
      blocking.timing,
    ),
    object_contact: firstMeaningful(
      actor.object_contact,
      actor.contact,
      blocking.object_contact,
      blocking.contact,
    ),
  };
}

function convergeActor({
  actor,
  actorIndex,
  openingFrame,
  closingFrame,
  actionEvidence,
  purpose,
  products,
}) {
  const source = object(actor);
  const existing = directActorBehavior(source);
  const role = actorLabel(source, actorIndex);
  const productEvidence = compactEvidence(products, "no explicitly named product");

  const behavior = {
    starting_position:
      existing.starting_position ||
      `${role} begins in the exact body position, orientation, wardrobe state and spatial relationship established by the opening frame: ${openingFrame}`,
    movement_path:
      existing.movement_path ||
      `${role} follows only the movement path required by these authored action beats: ${actionEvidence}. When no locomotion is explicitly required, remain at the established starting position without drifting or looping.`,
    eye_line:
      existing.eye_line ||
      `${role} maintains the motivated eye line implied by the action and purpose "${purpose}"; never looks into camera unless the authored shot explicitly directs it.`,
    gesture:
      existing.gesture ||
      `${role} uses restrained, role-appropriate gesture and facial progression synchronized to these action beats: ${actionEvidence}. Avoid repeated, mirrored or exaggerated motion.`,
    reaction_timing:
      existing.reaction_timing ||
      `${role} reacts only after the causal action beat becomes visible or audible, with timing that completes before the closing frame: ${closingFrame}`,
    object_contact:
      existing.object_contact ||
      `${role} makes anatomically credible hand and body contact only with objects explicitly established by the action beats or products (${productEvidence}); otherwise maintain no object contact.`,
  };

  return {
    ...source,
    role,
    ...behavior,
    blocking: {
      ...object(source.blocking),
      ...behavior,
    },
  };
}

function referenceValueId(value) {
  if (!value) return null;
  if (typeof value === "string" || typeof value === "number") {
    const normalized = String(value).trim();
    return normalized && normalized !== "[object Object]" ? normalized : null;
  }
  if (typeof value !== "object") return null;
  return String(
    value.id ||
    value.asset_id ||
    value.creative_asset_id ||
    value.source_asset_id ||
    value.reference_asset_id ||
    value.metadata?.source_asset_id ||
    value.metadata?.creative_asset_id ||
    "",
  ).trim() || null;
}

function nestedReferenceValues(shot = {}) {
  return [
    ...list(shot.reference_asset_ids),
    ...list(shot.assets),
    ...list(shot.master_still_contract?.reference_asset_ids),
    ...list(shot.location_reference_asset_ids),
    shot.location_reference_asset_id,
    shot.source_plate_asset_id,
    shot.composition_plan?.source_plate_asset_id,
    ...list(shot.reference_pack?.asset_ids),
    ...list(shot.reference_pack?.reference_asset_ids),
    ...list(shot.reference_pack?.location_asset_ids),
    ...list(shot.reference_pack?.brand_asset_ids),
    ...list(shot.brand_reference_asset_ids),
    shot.brand_reference_asset_id,
    ...list(shot.style_reference_asset_ids),
    shot.style_reference_asset_id,
    ...list(shot.text_reference_asset_ids),
    shot.text_reference_asset_id,
    ...list(shot.actors).flatMap((actor) => [
      ...list(actor?.identity_reference_asset_ids),
      actor?.identity_reference_asset_id,
      ...list(actor?.reference_asset_ids),
      actor?.reference_asset_id,
      ...list(actor?.wardrobe_reference_asset_ids),
      actor?.wardrobe_reference_asset_id,
      ...list(actor?.wardrobe?.reference_asset_ids),
      actor?.wardrobe?.reference_asset_id,
    ]),
    ...list(shot.products).flatMap((product) => [
      ...list(product?.reference_asset_ids),
      product?.reference_asset_id,
      ...list(product?.asset_ids),
      product?.asset_id,
    ]),
  ];
}

function referenceIds(shot = {}) {
  return unique(
    nestedReferenceValues(shot)
      .map(referenceValueId)
      .filter(Boolean),
  );
}

function assetRoleIndex(assets = []) {
  const byId = new Map();
  const byRole = new Map();

  for (const asset of list(assets)) {
    const id = creativeEvidenceAssetId(asset) || referenceValueId(asset);
    if (!id || byId.has(id)) continue;
    byId.set(id, asset);

    for (const role of classifyCreativeEvidenceRoles(asset)) {
      const normalized = String(role || "").toUpperCase();
      if (!normalized) continue;
      const values = byRole.get(normalized) || [];
      values.push(id);
      byRole.set(normalized, values);
    }
  }

  return { byId, byRole };
}

function roleIds(index, role) {
  return unique(list(index.byRole.get(String(role || "").toUpperCase()))).slice(0, 3);
}

function actorIdentityIds(actor = {}) {
  return unique([
    ...list(actor.identity_reference_asset_ids),
    actor.identity_reference_asset_id,
    ...list(actor.reference_asset_ids),
    actor.reference_asset_id,
  ].map(referenceValueId).filter(Boolean));
}

function actorWardrobeIds(actor = {}) {
  return unique([
    ...list(actor.wardrobe_reference_asset_ids),
    actor.wardrobe_reference_asset_id,
    ...list(actor.wardrobe?.reference_asset_ids),
    actor.wardrobe?.reference_asset_id,
  ].map(referenceValueId).filter(Boolean));
}

function productReferenceIds(product = {}) {
  return unique([
    ...list(product.reference_asset_ids),
    product.reference_asset_id,
    ...list(product.asset_ids),
    product.asset_id,
  ].map(referenceValueId).filter(Boolean));
}

function bindActors(actors = [], identityIds = [], wardrobeIds = []) {
  let identityCursor = 0;
  let wardrobeCursor = 0;

  return list(actors).map((actor) => {
    const source = object(actor);
    const identityMode = String(
      source.identity_mode || source.identityMode || "",
    ).toUpperCase();
    const existingIdentityIds = actorIdentityIds(source);
    const existingWardrobeIds = actorWardrobeIds(source);
    const next = { ...source };

    if (
      identityMode === "REFERENCE_IDENTITY" &&
      !existingIdentityIds.length &&
      identityIds.length
    ) {
      next.identity_reference_asset_ids = [
        identityIds[identityCursor % identityIds.length],
      ];
      identityCursor += 1;
    }

    const wardrobeReferenceRequired = Boolean(
      source.wardrobe_exact === true ||
      source.wardrobe_reference_required === true ||
      /REFERENCE|EXACT|MATCH|PRESERVE/i.test(
        typeof source.wardrobe === "string"
          ? source.wardrobe
          : JSON.stringify(source.wardrobe || {}),
      ),
    );

    if (
      wardrobeReferenceRequired &&
      !existingWardrobeIds.length &&
      wardrobeIds.length
    ) {
      next.wardrobe_reference_asset_ids = [
        wardrobeIds[wardrobeCursor % wardrobeIds.length],
      ];
      wardrobeCursor += 1;
    }

    return next;
  });
}

function bindProducts(products = [], productIds = []) {
  let cursor = 0;

  return list(products).map((product) => {
    const source = object(product);
    const exact = Boolean(
      source.exact === true ||
      source.reference_required === true ||
      /REFERENCE|EXACT|MATCH|PRESERVE/i.test(JSON.stringify(source)),
    );
    if (!exact || productReferenceIds(source).length || !productIds.length) {
      return source;
    }

    const id = productIds[cursor % productIds.length];
    cursor += 1;
    return {
      ...source,
      reference_asset_ids: [id],
    };
  });
}

function bindShotEvidence({ scene = {}, shot = {}, assets = [] } = {}) {
  const source = object(shot);
  const index = assetRoleIndex(assets);
  const explicitIds = referenceIds(source);
  const requirements = deriveCreativeEvidenceRequirements({
    scene,
    shot: source,
    authorized_assets: [],
  });
  const requiredRoles = unique(requirements.map((requirement) => requirement.role));
  const selectedByRole = new Map(
    requiredRoles.map((role) => [role, roleIds(index, role)]),
  );
  const selectedIds = unique([
    ...explicitIds,
    ...requiredRoles.flatMap((role) => list(selectedByRole.get(role))),
  ]);
  const locationIds = list(selectedByRole.get("LOCATION"));
  const brandIds = list(selectedByRole.get("BRAND"));
  const identityIds = list(selectedByRole.get("IDENTITY"));
  const wardrobeIds = list(selectedByRole.get("WARDROBE"));
  const productIds = list(selectedByRole.get("PRODUCT"));
  const styleIds = list(selectedByRole.get("STYLE"));
  const textIds = list(selectedByRole.get("TEXT"));
  const existingRequirements = object(source.evidence_requirements);
  const generatedRoles = unique([
    ...list(existingRequirements.generated_roles),
    ...list(existingRequirements.excluded_exact_roles),
  ]);
  const referencePack = object(source.reference_pack);
  const compositionPlan = object(source.composition_plan);

  return {
    ...source,
    actors: bindActors(source.actors, identityIds, wardrobeIds),
    products: bindProducts(source.products, productIds),
    reference_asset_ids: selectedIds,
    assets: selectedIds,
    location_reference_asset_ids: unique([
      ...list(source.location_reference_asset_ids),
      source.location_reference_asset_id,
      ...locationIds,
    ].map(referenceValueId).filter(Boolean)),
    brand_reference_asset_ids: unique([
      ...list(source.brand_reference_asset_ids),
      source.brand_reference_asset_id,
      ...brandIds,
    ].map(referenceValueId).filter(Boolean)),
    style_reference_asset_ids: unique([
      ...list(source.style_reference_asset_ids),
      source.style_reference_asset_id,
      ...styleIds,
    ].map(referenceValueId).filter(Boolean)),
    text_reference_asset_ids: unique([
      ...list(source.text_reference_asset_ids),
      source.text_reference_asset_id,
      ...textIds,
    ].map(referenceValueId).filter(Boolean)),
    evidence_requirements: {
      ...existingRequirements,
      required_roles: unique([
        ...list(existingRequirements.required_roles),
        ...requiredRoles,
      ]).filter((role) => !generatedRoles.includes(role)),
      generated_roles: generatedRoles,
      excluded_exact_roles: generatedRoles,
      deterministic_binding_version:
        "CREATIVE_STORYBOARD_EVIDENCE_BINDING_V3",
    },
    reference_pack: {
      ...referencePack,
      asset_ids: unique([
        ...list(referencePack.asset_ids),
        ...selectedIds,
      ].map(referenceValueId).filter(Boolean)),
      reference_asset_ids: unique([
        ...list(referencePack.reference_asset_ids),
        ...selectedIds,
      ].map(referenceValueId).filter(Boolean)),
      location_asset_ids: unique([
        ...list(referencePack.location_asset_ids),
        ...locationIds,
      ].map(referenceValueId).filter(Boolean)),
      brand_asset_ids: unique([
        ...list(referencePack.brand_asset_ids),
        ...brandIds,
      ].map(referenceValueId).filter(Boolean)),
      required_roles: unique([
        ...list(referencePack.required_roles),
        ...requiredRoles,
      ]).filter((role) => !generatedRoles.includes(role)),
    },
    composition_plan: {
      ...compositionPlan,
      source_plate_asset_id:
        compositionPlan.source_plate_asset_id || locationIds[0] || null,
    },
    metadata: {
      ...object(source.metadata),
      evidence_binding: {
        version: "CREATIVE_STORYBOARD_EVIDENCE_BINDING_V3",
        required_roles: requiredRoles,
        selected_asset_ids: selectedIds,
        selected_by_role: Object.fromEntries(
          requiredRoles.map((role) => [role, list(selectedByRole.get(role))]),
        ),
        unresolved_roles: requiredRoles.filter(
          (role) => !list(selectedByRole.get(role)).length,
        ),
        fail_closed: true,
      },
    },
  };
}

function referencePreserveRules({ references, openingFrame, closingFrame }) {
  if (references.length) {
    return references.map(
      (id) =>
        `Preserve the exact identity, geometry, color, material, wardrobe, architecture, signage, logo, product state, text and perspective-critical truth supplied by canonical reference asset ${id} from opening frame (${openingFrame}) through closing frame (${closingFrame}).`,
    );
  }

  return [
    `Preserve every factual identity, venue, product, brand, wardrobe, prop, text, geography and spatial detail explicitly established by this shot's authored opening frame (${openingFrame}), action and closing frame (${closingFrame}).`,
  ];
}

function referenceNeverChangeRules(references) {
  if (references.length) {
    return [
      `Never alter, replace, beautify, relabel or hallucinate the identities, faces, bodies, wardrobe, logos, signage, architecture, products, text, colors or geometry established by canonical references ${references.join(", ")}.`,
    ];
  }

  return [
    "Never introduce unverified people, identities, faces, logos, signage, architecture, products, claims, wardrobe details, text or venue features that are not established by the mission, supplied evidence or authored shot direction.",
  ];
}

function convergeReferencePack({
  shot,
  references,
  openingFrame,
  closingFrame,
  purpose,
}) {
  const source = object(shot.reference_pack);
  const contract = {
    ...object(shot.reference_contract),
    ...object(shot.reference_rules),
  };

  return {
    ...contract,
    ...source,
    preserve: firstList(
      source.preserve,
      contract.preserve,
      shot.master_still_contract?.immutable_locks,
      referencePreserveRules({ references, openingFrame, closingFrame }),
    ),
    never_change: firstList(
      source.never_change,
      contract.never_change,
      shot.master_still_contract?.prohibited_changes,
      referenceNeverChangeRules(references),
    ),
    may_change: firstList(
      source.may_change,
      contract.may_change,
      shot.master_still_contract?.permitted_motion,
      [
        "Camera position, actor pose, object motion, environmental motion, focus, exposure and lighting intensity may change only where the authored camera, performance, action, lighting and transition direction explicitly requires the change.",
      ],
    ),
    may_change_reason:
      firstMeaningful(
        source.may_change_reason,
        contract.may_change_reason,
        shot.master_still_contract?.safe_motion_space,
      ) ||
      `Permit only changes required to achieve the shot purpose "${purpose}" while preserving every factual and continuity lock.`,
  };
}

function convergeContinuity({
  shot,
  references,
  actors,
  openingFrame,
  closingFrame,
  sceneIndex,
  shotIndex,
}) {
  const source = {
    ...object(shot.continuity_contract),
    ...object(shot.temporal_contract?.continuity),
    ...object(shot.continuity),
  };
  const actorRoles = actors.map(actorLabel);
  const locks = [
    ...list(source.locks),
    ...(references.length
      ? [`Lock canonical reference assets across the complete shot: ${references.join(", ")}.`]
      : []),
    ...(actorRoles.length
      ? [
          `Lock actor identity, role, wardrobe, handedness, anatomy, body proportions, object ownership, screen direction and relationship continuity for ${actorRoles.join(", ")}.`,
        ]
      : ["Lock the absence of human subjects unless the authored shot explicitly establishes a person."]),
    "Lock venue geography, architecture, signage, product geometry, prop state, text, light direction, time-of-day logic, reflections, shadows and every continuity-relevant spatial relationship established by the shot.",
  ];

  return {
    ...source,
    entering:
      firstMeaningful(source.entering, source.entering_state) ||
      `${sceneIndex === 0 && shotIndex === 0 ? "Opening production state" : "Inherited state from the preceding shot"}: ${openingFrame}`,
    leaving:
      firstMeaningful(source.leaving, source.leaving_state) ||
      `Exact handoff state after the authored action completes: ${closingFrame}`,
    locks: unique(locks),
    handoff_requirements: firstList(
      source.handoff_requirements,
      [
        `The following shot must begin from this shot's exact leaving state, including identity, body position, wardrobe, props, product state, screen direction, architecture, lighting direction, environmental motion and sound continuity: ${closingFrame}`,
      ],
    ),
  };
}

function convergeRealityRules({
  shot,
  actors,
  actionEvidence,
  products,
  openingFrame,
  closingFrame,
}) {
  const source = {
    ...object(shot.physical_reality_rules),
    ...object(shot.reality_rules),
  };
  const actorRoles = actors.map(actorLabel);
  const humanFallback = actorRoles.length
    ? [
        `Maintain anatomically correct, temporally coherent human performance for ${actorRoles.join(", ")}: stable identity and body proportions, correct joints and fingers, causal gaze, non-looping gesture, credible balance, breath, reaction timing and object contact throughout the action (${actionEvidence}).`,
      ]
    : [
        "No human subject is present in this shot; do not introduce, clone, reflect, shadow or imply a person unless a human is explicitly established by the authored shot direction.",
      ];

  return {
    ...source,
    human: firstList(source.human, humanFallback),
    physical: firstList(source.physical, [
      `Preserve gravity, inertia, momentum, collision, scale, perspective, object permanence and contact mechanics. Products and props (${compactEvidence(products, "none explicitly established")}) may move only as caused by the authored action; no teleporting, morphing, penetration, floating or spontaneous duplication.`,
    ]),
    environment: firstList(source.environment, [
      `Preserve the environment continuously from opening frame (${openingFrame}) to closing frame (${closingFrame}): stable venue geometry, architecture, signage, text, surfaces, reflections, shadows, light direction, weather, smoke, liquid, crowds and background motion.`,
    ]),
  };
}

function convergePostProduction({
  shot,
  purpose,
  openingFrame,
  closingFrame,
}) {
  const source = {
    ...object(shot.editorial_contract),
    ...object(shot.edit_contract),
    ...object(shot.post_production_contract),
    ...object(shot.post_production),
  };
  const transitionIn = object(shot.transition_in);
  const transitionOut = object(shot.transition_out);
  const authoredSound = {
    dialogue: list(shot.dialogue),
    narration: object(shot.narration),
    music: object(shot.music),
    sound_effects: list(shot.sound_effects),
  };

  return {
    ...source,
    owner:
      firstMeaningful(source.owner, source.department, source.responsible_team) ||
      "SOUND_EDITORIAL_POST",
    image_generation: firstMeaningful(source.image_generation, source.image_stage) ||
      "Generate the approved visual plate and master-still composition only. Do not burn in subtitles, campaign typography, UI, graphic overlays or newly invented logos. Preserve any physically present, evidence-backed signage or text as part of the referenced environment.",
    motion_generation: firstMeaningful(source.motion_generation, source.motion_stage) ||
      `Animate only the authored camera, performance, object and environmental changes required to move credibly from the opening state (${openingFrame}) to the closing state (${closingFrame}). Do not add unplanned action, text, identities, products or venue features.`,
    editorial: firstMeaningful(source.editorial, source.editing, source.edit) ||
      `Own the exact shot duration, cut motivation, pacing and handoff required by the editorial purpose "${purpose}". Respect the authored transition-in (${compactEvidence(transitionIn, "direct continuity from the previous approved state")}) and transition-out (${compactEvidence(transitionOut, "clean handoff to the next approved state")}).`,
    color_finishing: firstMeaningful(source.color_finishing, source.color, source.grade) ||
      "Perform exposure balancing, color continuity, highlight and shadow protection, skin and product consistency, grain, sharpening and artifact cleanup without changing factual colors, identity, wardrobe, architecture, signage, product appearance or lighting motivation.",
    sound_post: firstMeaningful(source.sound_post, source.sound, source.audio) ||
      `Build only from the authored sound direction (${compactEvidence(authoredSound, "intentional production silence and verified room tone")}). Own synchronization, room tone, Foley, dialogue or narration clarity, music function, effects, dynamics, transitions and loudness while avoiding invented speech or claims.`,
    graphics_and_text: firstMeaningful(
      source.graphics_and_text,
      source.graphics,
      source.typography,
    ) ||
      "Apply typography, subtitles, captions, logos, end cards and graphic overlays only when explicitly authored and supported by approved brand assets or verified copy. Keep generator-created text out of source imagery and render approved text in post.",
    final_qa: firstMeaningful(source.final_qa, source.qa, source.delivery_qa) ||
      "Before approval, verify frame continuity, duration, edit points, identity and reference fidelity, anatomy, object contact, geometry, text and logo accuracy, color, sound sync, subtitle timing, safe areas, compression, resolution and absence of generation artifacts.",
    release_gate: firstMeaningful(source.release_gate, source.approval_gate) ||
      "Release only after image, motion, editorial, color, sound, graphics and continuity checks all pass against the approved shot contract; unresolved factual or reference uncertainty remains blocking.",
  };
}

function convergeShot({ shot, scene, assets, sceneIndex, shotIndex }) {
  const source = bindShotEvidence({ scene, shot, assets });
  const openingFrame = compactEvidence(
    firstMeaningful(
      source.opening_frame,
      source.opening_state,
      source.frame_zero_description,
    ),
    "the exact authored frame-zero state",
  );
  const closingFrame = compactEvidence(
    firstMeaningful(
      source.closing_frame,
      source.closing_state,
      source.end_frame,
    ),
    "the exact authored final-frame state",
  );
  const purpose = compactEvidence(
    firstMeaningful(source.purpose, source.objective, source.title),
    "the authored editorial purpose",
  );
  const actionEvidence = compactEvidence(
    firstMeaningful(
      source.action_beats,
      source.performance_direction,
      source.action,
      source.description,
    ),
    "hold the authored state without unplanned action",
  );
  const products = list(source.products);
  const references = referenceIds(source);
  const actors = list(source.actors).map((actor, actorIndex) =>
    convergeActor({
      actor,
      actorIndex,
      openingFrame,
      closingFrame,
      actionEvidence,
      purpose,
      products,
    }),
  );

  return {
    ...source,
    actors,
    reference_asset_ids: references,
    assets: references,
    reference_pack: convergeReferencePack({
      shot: source,
      references,
      openingFrame,
      closingFrame,
      purpose,
    }),
    continuity: convergeContinuity({
      shot: source,
      references,
      actors,
      openingFrame,
      closingFrame,
      sceneIndex,
      shotIndex,
    }),
    reality_rules: convergeRealityRules({
      shot: source,
      actors,
      actionEvidence,
      products,
      openingFrame,
      closingFrame,
    }),
    post_production: convergePostProduction({
      shot: source,
      purpose,
      openingFrame,
      closingFrame,
    }),
  };
}

export function convergeCreativeStoryboardExecutionContracts({
  creativePlan,
  assets = [],
} = {}) {
  const plan = clone(creativePlan) || {};
  const scenes = list(plan.scenes).map((scene, sceneIndex) => ({
    ...scene,
    scene_number: sceneIndex + 1,
    shots: list(scene.shots).map((shot, shotIndex) =>
      convergeShot({
        shot,
        scene,
        assets,
        sceneIndex,
        shotIndex,
      }),
    ),
  }));

  return {
    ...plan,
    scenes,
    metadata: {
      ...object(plan.metadata),
      storyboard_execution_contract_convergence: {
        version: "evidence-derived-execution-contract-v2",
        applied: true,
        scene_count: scenes.length,
        shot_count: scenes.reduce(
          (total, scene) => total + list(scene.shots).length,
          0,
        ),
        post_production_ownership_converged: true,
        factual_invention_allowed: false,
        canonical_asset_selection_allowed: true,
        deterministic_evidence_role_binding: true,
        evidence_binding_version: "CREATIVE_STORYBOARD_EVIDENCE_BINDING_V3",
        validator_requirements_weakened: false,
      },
    },
  };
}
