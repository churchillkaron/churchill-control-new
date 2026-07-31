import {
  CREATIVE_AGENCY_ROLES,
} from "@/lib/creative/director/registry/CreativeAgencyRoleRegistry";

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
  return [...new Set(list(values).map(text).filter(Boolean))];
}

function ensureText(value, fallback, minimum, repairs, path) {
  const current = text(value);
  if (current.length >= minimum) return current;
  const completed = current
    ? `${current}. ${fallback}`
    : fallback;
  repairs.push(path);
  return completed.length >= minimum
    ? completed
    : `${completed}. Preserve all approved evidence, identities and continuity while executing this direction precisely.`;
}

function contextFor({ mission = {}, project = {}, brief = {} } = {}) {
  const projectMetadata = object(project.metadata);
  const missionMetadata = object(mission.metadata);
  const duration = finite(
    project.target_duration ??
    projectMetadata.target_duration ??
    brief.duration_seconds ??
    missionMetadata.target_duration,
  ) || 10;
  const channels = unique([
    ...list(project.target_channels),
    ...list(brief.channels),
    ...list(mission.channels),
  ].map((value) => text(value).toLowerCase()));
  const profileId = text(
    projectMetadata.default_export_profile_id ||
    missionMetadata.default_export_profile_id,
  );
  const profiles = list(
    projectMetadata.export_profiles ||
    missionMetadata.export_profiles,
  );
  const profile = profiles.find((item) => text(item?.id) === profileId) ||
    profiles.find((item) => item?.default === true) ||
    profiles[0] ||
    {};
  const vertical =
    Number(profile.width) < Number(profile.height) ||
    channels.some((channel) => [
      "facebook",
      "instagram",
      "tiktok",
      "shorts",
      "reels",
      "story",
    ].includes(channel));
  const width = finite(profile.width) || (vertical ? 1080 : 1920);
  const height = finite(profile.height) || (vertical ? 1920 : 1080);
  return {
    workflow_kind: text(project.production_type || missionMetadata.production_type).toUpperCase() === "VIDEO"
      ? "TEMPORAL"
      : "TEMPORAL",
    duration_seconds: duration,
    channels,
    profile_id: profileId || (vertical ? "master-vertical-h264" : "master-landscape-h264"),
    width,
    height,
    frame_rate: finite(profile.frame_rate) || 30,
    aspect_ratio: `${width}:${height}`,
    objective: text(
      brief.creative_objective ||
      brief.business_goal ||
      project.objective ||
      mission.objective ||
      mission.business_goal,
    ),
  };
}

function completeConcept(plan, context, repairs) {
  const source = object(plan.concept);
  const message = ensureText(
    source.message,
    context.objective || "Use verified real-world evidence to make the audience understand why this experience is worth choosing.",
    15,
    repairs,
    "concept.message",
  );
  return {
    ...source,
    title: ensureText(source.title, "Verified experience, made immediate", 15, repairs, "concept.title"),
    creative_thesis: ensureText(
      source.creative_thesis,
      `Convert real asset evidence into one clear audience promise: ${message}`,
      15,
      repairs,
      "concept.creative_thesis",
    ),
    hook: ensureText(
      source.hook,
      "Open on a specific action or visual contradiction that reveals the real setting immediately.",
      15,
      repairs,
      "concept.hook",
    ),
    message,
    narrative: ensureText(
      source.narrative,
      `Move from curiosity to visible proof, then resolve with an earned invitation connected to ${message}`,
      15,
      repairs,
      "concept.narrative",
    ),
    visual_system: ensureText(
      source.visual_system,
      "Use verified asset colours and textures, controlled contrast, channel-safe composition and externally rendered typography.",
      15,
      repairs,
      "concept.visual_system",
    ),
    emotional_promise: ensureText(
      source.emotional_promise,
      "Make the viewer feel the experience is real, socially inviting and credible rather than generically advertised.",
      15,
      repairs,
      "concept.emotional_promise",
    ),
    call_to_action: ensureText(
      source.call_to_action,
      "Finish with a restrained verifiable invitation earned by the visible proof, without unsupported claims.",
      15,
      repairs,
      "concept.call_to_action",
    ),
  };
}

function completeStory(plan, concept, repairs) {
  const source = object(plan.story);
  const fallbacks = {
    hook: `Begin with ${concept.hook} and provide immediate contextual reward.`,
    audience_tension: "The audience wants credible proof of a worthwhile experience but distrusts generic promotional claims.",
    escalation: "Add distinct verified evidence at each beat so conviction increases without repeated atmosphere or filler.",
    observable_proof: "Use the selected original assets to prove identity, place, product or activity while preserving factual details.",
    turn: "Shift from observation to a human or spatial cue that lets the viewer imagine participating.",
    resolution: `Connect the accumulated proof directly to this message: ${concept.message}`,
    call_to_action: concept.call_to_action,
    emotional_arc: "Progress from curiosity to recognition, confidence, desire and a calm readiness to act.",
    anti_cliche_strategy: "Reject generic montage rhythm, unsupported superlatives, repeated beauty shots and AI spectacle.",
  };
  const completed = { ...source };
  for (const [field, fallback] of Object.entries(fallbacks)) {
    completed[field] = ensureText(
      source[field],
      fallback,
      20,
      repairs,
      `story.${field}`,
    );
  }
  return completed;
}

function completeRoles(plan, context, repairs) {
  const source = object(plan.role_decisions);
  const completed = { ...source };
  for (const role of CREATIVE_AGENCY_ROLES) {
    const decision = object(source[role.id]);
    const applies = role.applies_to.includes("ALL") ||
      role.applies_to.includes(context.workflow_kind);
    const suppliedStatus = text(decision.status).toUpperCase();
    const status = ["ACTIVE", "NOT_REQUIRED"].includes(suppliedStatus)
      ? suppliedStatus
      : applies ? "ACTIVE" : "NOT_REQUIRED";
    if (status !== suppliedStatus) repairs.push(`role_decisions.${role.id}.status`);
    if (status === "NOT_REQUIRED") {
      completed[role.id] = { ...decision, status };
      continue;
    }
    const evidence = list(decision.evidence).length
      ? decision.evidence
      : [
          "Validated brief and channel requirements",
          "Verified selected-asset manifest",
          "Validated company and market research",
        ];
    if (!list(decision.evidence).length) repairs.push(`role_decisions.${role.id}.evidence`);
    const confidence = finite(decision.confidence);
    if (confidence === null || confidence < 0 || confidence > 100) {
      repairs.push(`role_decisions.${role.id}.confidence`);
    }
    completed[role.id] = {
      ...decision,
      status,
      decision: ensureText(
        decision.decision,
        `${role.mandate} Apply this mandate to the approved objective and require evidence before production or release.`,
        20,
        repairs,
        `role_decisions.${role.id}.decision`,
      ),
      evidence,
      confidence: confidence !== null && confidence >= 0 && confidence <= 100
        ? confidence
        : 82,
      risks: list(decision.risks).length
        ? decision.risks
        : ["Loss of specificity, evidence or continuity during execution"],
      repair_instructions: list(decision.repair_instructions).length
        ? decision.repair_instructions
        : ["Repair only this role decision against approved evidence without changing unrelated creative choices"],
    };
  }
  return completed;
}

function completeDeliverables(plan, context, repairs) {
  return list(plan.deliverables).map((deliverable, index) => {
    const source = object(deliverable);
    const existingSpec = object(source.output_spec);
    if (!Object.keys(existingSpec).length) repairs.push(`deliverables.${index}.output_spec`);
    return {
      ...source,
      id: ensureText(source.id, `deliverable-${index + 1}`, 3, repairs, `deliverables.${index}.id`),
      type: ensureText(source.type, "VIDEO", 3, repairs, `deliverables.${index}.type`),
      purpose: ensureText(
        source.purpose,
        "Deliver the approved idea in the requested format with preserved brand truth and measurable audience intent.",
        15,
        repairs,
        `deliverables.${index}.purpose`,
      ),
      channels: unique([...list(source.channels), ...context.channels]),
      output_spec: {
        duration_seconds: context.duration_seconds,
        width: context.width,
        height: context.height,
        aspect_ratio: context.aspect_ratio,
        frame_rate: context.frame_rate,
        container: "mp4",
        video_codec: "h264",
        pixel_format: "yuv420p",
        export_profile_id: context.profile_id,
        render_text_outside_generated_pixels: true,
        public_publish_authorized: false,
        ...existingSpec,
      },
    };
  });
}

function completeMappedFields(source, fallbacks, minimum, repairs, base) {
  const completed = { ...source };
  for (const [field, fallback] of Object.entries(fallbacks)) {
    completed[field] = ensureText(
      source[field],
      fallback,
      minimum,
      repairs,
      `${base}.${field}`,
    );
  }
  return completed;
}

function completeShot(shot, scene, sceneIndex, shotIndex, context, repairs) {
  const source = object(shot);
  const base = `scenes.${sceneIndex}.shots.${shotIndex}`;
  const subject = ensureText(
    source.subject,
    "The exact verified subject assigned to this shot with recognisable identity and contextual detail.",
    8,
    repairs,
    `${base}.subject`,
  );
  const action = ensureText(
    source.action,
    `Show ${subject.toLowerCase()} completing one visible action that advances the scene objective instead of posing.`,
    20,
    repairs,
    `${base}.action`,
  );
  const performance = ensureText(
    source.performance,
    "Use credible micro-behaviour, natural timing, eye movement, weight transfer, hand contact and reaction appropriate to the action.",
    20,
    repairs,
    `${base}.performance`,
  );
  const duration = finite(source.duration_seconds) ||
    finite(scene.duration_seconds) ||
    context.duration_seconds;
  if (!finite(source.duration_seconds)) repairs.push(`${base}.duration_seconds`);

  const frameSource = object(source.frame_plan);
  const framePlan = completeMappedFields(frameSource, {
    opening_frame: `Open on a complete ${context.aspect_ratio} composition establishing ${subject}, spatial context, motivated light and the pre-action state.`,
    progression: `Across ${duration} seconds, unfold the action in readable stages with stable identity, object permanence, motivated camera movement and new evidence at each beat.`,
    closing_frame: "Close after the action creates a visible changed state, preserving screen direction and negative space for external graphics.",
  }, 30, repairs, `${base}.frame_plan`);
  framePlan.progression = ensureText(
    frameSource.progression,
    `Across ${duration} seconds, unfold the action in readable stages with stable identity, object permanence, motivated camera movement and new evidence at each beat.`,
    40,
    repairs,
    `${base}.frame_plan.progression`,
  );

  const camera = completeMappedFields(object(source.camera), {
    framing: "Purposeful medium-wide framing with subject and evidence readable inside the channel safe area.",
    angle: "Natural eye-level or motivated low angle preserving credible spatial relationships.",
    camera_distance: "Close enough to read the action while retaining environmental proof around the subject.",
    lens_intent: "Natural perspective with restrained depth separation and no synthetic wide-angle distortion.",
    movement_path: "One motivated push, lateral reveal or locked observation aligned with the action.",
    movement_speed: "Slow acceleration and deceleration without abrupt mechanically perfect motion.",
    stabilization: "Controlled gimbal or tripod movement with appropriate physical realism.",
    movement_motivation: "Move only to reveal evidence, follow action or transfer attention to the changed state.",
    focus_target: "Hold focus on the exact subject detail proving the current story beat.",
    focus_transition: "Use one motivated focus transfer only when attention must pass to newly revealed evidence.",
  }, 5, repairs, `${base}.camera`);

  const lighting = completeMappedFields(object(source.lighting), {
    source: "Use the existing motivated venue or daylight source and supplement invisibly.",
    direction: "Preserve observed source direction, natural falloff and contact shadows.",
    contrast: "Keep readable subject separation while retaining real shadow detail.",
    colour: "Match verified colour temperature and protect skin, food, product and brand colours.",
    exposure_intent: "Protect highlights, retain textured blacks and expose the proof detail consistently.",
  }, 5, repairs, `${base}.lighting`);

  const productionDesign = completeMappedFields(object(source.production_design), {
    environment: "Preserve verified architecture, furniture, signage and spatial character without invented venue features.",
    wardrobe: "Keep verified wardrobe and grooming unchanged unless approved evidence supports another choice.",
    props: "Use only action-relevant verified props with stable count, orientation and contact state.",
    materials: "Preserve credible wood, metal, glass, fabric, skin and food response under motivated light.",
    texture_detail: "Retain surface wear, condensation, crumbs, reflections and contact detail preventing synthetic smoothness.",
  }, 5, repairs, `${base}.production_design`);

  const continuity = completeMappedFields(object(source.continuity), {
    identity: "Preserve exact facial, body, clothing and distinguishing identity anchors from approved references.",
    product: "Preserve exact product shape, portion, colour, branding and placement through every frame.",
    location: "Preserve architecture, furniture, signage, lighting positions and background geography.",
    wardrobe: "Preserve wardrobe, accessories, grooming and fabric behaviour without mutation.",
    screen_direction: "Maintain established eyelines and action direction through the edit.",
    spatial_geography: "Keep subject, props and camera on a coherent map with stable scale and contact.",
  }, 5, repairs, `${base}.continuity`);

  const audio = completeMappedFields(object(source.audio), {
    source_sound: "Use authentic room tone and action-synchronised sound tied to visible contact and movement.",
    mix_intent: "Keep proof action and human presence forward, ambience supportive and music restrained.",
  }, 5, repairs, `${base}.audio`);
  audio.mix_intent = ensureText(
    source.audio?.mix_intent,
    "Keep proof action and human presence forward, ambience supportive, music restrained and transitions free from masking.",
    10,
    repairs,
    `${base}.audio.mix_intent`,
  );

  const negativeConstraints = unique([
    ...list(source.negative_constraints),
    "Do not regenerate or approximate recognisable people, logos, architecture, food, products or verified source identity",
    "No malformed anatomy, duplicate objects, floating contact, impossible reflections, shadow discontinuity or object mutation",
    "No generated typography, fake logos, invented offers, unverified claims, watermarks or subtitles inside generated pixels",
    "No excessive camera motion, plastic texture, over-smoothed skin, depth warping or generic AI-commercial styling",
  ]);
  if (!list(source.negative_constraints).length) repairs.push(`${base}.negative_constraints`);

  const repairInstructions = unique([
    ...list(source.repair_instructions),
    "Repair only the failed region or time range and preserve approved frames, identity anchors and continuity outside that boundary",
    "Re-run against the same references and output specification, then compare opening, progression and closing frames",
    "Reject any repair that introduces a new identity, product, physics, text, audio or continuity defect",
  ]);
  if (!list(source.repair_instructions).length) repairs.push(`${base}.repair_instructions`);

  const generation = object(source.generation);
  const providerPrompt = ensureText(
    generation.provider_prompt,
    [
      `Create a ${duration}-second ${context.aspect_ratio} shot.`,
      `Subject: ${subject}.`,
      `Action: ${action}.`,
      `Performance: ${performance}.`,
      `Opening: ${framePlan.opening_frame}.`,
      `Progression: ${framePlan.progression}.`,
      `Closing: ${framePlan.closing_frame}.`,
      `Camera: ${camera.framing}; ${camera.movement_path}; focus on ${camera.focus_target}.`,
      `Lighting: ${lighting.source}; ${lighting.direction}; ${lighting.exposure_intent}.`,
      `Continuity: ${continuity.identity}; ${continuity.product}; ${continuity.location}.`,
      "Treat every supplied reference as binding identity and factual continuity evidence.",
    ].join(" "),
    120,
    repairs,
    `${base}.generation.provider_prompt`,
  );
  const negativePrompt = ensureText(
    generation.negative_prompt,
    negativeConstraints.join("; "),
    40,
    repairs,
    `${base}.generation.negative_prompt`,
  );
  const existingSpec = object(generation.output_spec);
  if (!Object.keys(existingSpec).length) repairs.push(`${base}.generation.output_spec`);

  return {
    ...source,
    id: text(source.id) || `scene-${sceneIndex + 1}-shot-${shotIndex + 1}`,
    title: ensureText(source.title, `Evidence beat ${sceneIndex + 1}.${shotIndex + 1}`, 8, repairs, `${base}.title`),
    purpose: ensureText(
      source.purpose,
      `Deliver distinct visible evidence advancing this objective: ${text(scene.objective) || context.objective}`,
      20,
      repairs,
      `${base}.purpose`,
    ),
    subject,
    action,
    performance,
    duration_seconds: duration,
    frame_plan: framePlan,
    camera,
    lighting,
    production_design: productionDesign,
    continuity,
    audio,
    transition_in: ensureText(
      source.transition_in,
      "Enter on matched movement, motivated sound or a visual detail inherited from the preceding beat.",
      8,
      repairs,
      `${base}.transition_in`,
    ),
    transition_out: ensureText(
      source.transition_out,
      "Leave on the completed action or changed state that causally motivates the following beat.",
      8,
      repairs,
      `${base}.transition_out`,
    ),
    negative_constraints: negativeConstraints,
    known_failure_modes: unique([
      ...list(source.known_failure_modes),
      "Identity or reference-asset drift",
      "Object permanence, contact, reflection or shadow discontinuity",
      "Generated text or logo corruption",
      "Generic pacing or repeated story information",
    ]),
    repair_instructions: repairInstructions,
    generation: {
      ...generation,
      required: generation.required !== false,
      service: text(generation.service) || "ai.video.generate",
      capability: text(generation.capability) || "ai.video.generate",
      provider_prompt: providerPrompt,
      negative_prompt: negativePrompt,
      output_spec: {
        duration_seconds: duration,
        width: context.width,
        height: context.height,
        aspect_ratio: context.aspect_ratio,
        frame_rate: context.frame_rate,
        container: "mp4",
        video_codec: "h264",
        pixel_format: "yuv420p",
        export_profile_id: context.profile_id,
        preserve_reference_identity: true,
        preserve_reference_products: true,
        preserve_reference_location: true,
        render_text_outside_generated_pixels: true,
        public_publish_authorized: false,
        ...existingSpec,
      },
    },
  };
}

function completeScenes(plan, context, repairs) {
  return list(plan.scenes).map((scene, sceneIndex) => {
    const source = object(scene);
    const base = `scenes.${sceneIndex}`;
    const completedScene = {
      ...source,
      id: text(source.id) || `scene-${sceneIndex + 1}`,
      title: ensureText(source.title, `Proof transition ${sceneIndex + 1}`, 8, repairs, `${base}.title`),
      objective: ensureText(
        source.objective,
        `Deliver distinct visible evidence moving the audience toward ${context.objective}`,
        20,
        repairs,
        `${base}.objective`,
      ),
      story_state_before: ensureText(
        source.story_state_before,
        "The audience has not yet seen the specific proof assigned to this scene.",
        20,
        repairs,
        `${base}.story_state_before`,
      ),
      state_change: ensureText(
        source.state_change,
        "The audience observes new verifiable evidence that changes its understanding of the offer.",
        20,
        repairs,
        `${base}.state_change`,
      ),
      story_state_after: ensureText(
        source.story_state_after,
        "The audience has another concrete reason to trust the message and is ready for the next causal beat.",
        20,
        repairs,
        `${base}.story_state_after`,
      ),
      transition_logic: ensureText(
        source.transition_logic,
        "The changed audience knowledge creates the visual and causal bridge into the next scene.",
        15,
        repairs,
        `${base}.transition_logic`,
      ),
    };
    return {
      ...completedScene,
      shots: list(source.shots).map((shot, shotIndex) =>
        completeShot(shot, completedScene, sceneIndex, shotIndex, context, repairs)),
    };
  });
}

export const CreativeMasterPlanCompletionRuntimeV2 = {
  complete({ plan = {}, mission = {}, project = {}, brief = {} } = {}) {
    const repairs = [];
    const source = object(plan);
    const context = contextFor({ mission, project, brief });
    const concept = completeConcept(source, context, repairs);
    return {
      ...source,
      workflow_kind: text(source.workflow_kind).toUpperCase() || context.workflow_kind,
      concept,
      story: completeStory(source, concept, repairs),
      deliverables: completeDeliverables(source, context, repairs),
      role_decisions: completeRoles(source, context, repairs),
      scenes: completeScenes(source, context, repairs),
      quality: object(source.quality),
      completion: {
        contract: "CREATIVE_MASTER_PLAN_COMPLETION_V2",
        mode: "DETERMINISTIC_SCHEMA_COMPLETION",
        preserved_provider_direction: true,
        repaired_field_count: repairs.length,
        repaired_fields: unique(repairs),
        completed_at: new Date().toISOString(),
      },
    };
  },
};
