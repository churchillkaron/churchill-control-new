import {
  CREATIVE_AGENCY_ROLES,
} from "@/lib/creative/director/registry/CreativeAgencyRoleRegistry";

const GENERIC_DIRECTION = [
  /^scene\s+\d+$/i,
  /^shot\s+\d+$/i,
  /choose .* to support/i,
  /selected per scene/i,
  /premium and authentic/i,
  /professional$/i,
  /natural$/i,
  /soft$/i,
  /cinematic$/i,
  /compelling original production/i,
];

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

function upper(value) {
  return text(value).toUpperCase();
}

function unique(values = []) {
  return [...new Set(list(values).map(text).filter(Boolean))];
}

function isGeneric(value) {
  const normalized = text(value);
  return normalized
    ? GENERIC_DIRECTION.some((pattern) => pattern.test(normalized))
    : false;
}

function completedText(value, fallback, minimum, repairs, path) {
  const current = text(value);
  if (current.length >= minimum && !isGeneric(current)) return current;

  const joined = current && !isGeneric(current)
    ? `${current}. ${text(fallback)}`
    : text(fallback);
  const completed = joined.length >= minimum
    ? joined
    : `${joined}. Execute this direction precisely while preserving the approved brand, asset, story, camera, continuity and quality constraints.`;
  repairs.push(path);
  return completed;
}

function workflowKind(plan = {}) {
  return upper(plan.workflow_kind) || "TEMPORAL";
}

function contextFor(input = {}) {
  const mission = object(input.mission);
  const project = object(input.project);
  const brief = object(input.brief);
  const plan = object(input.plan);
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
  const frameRate = finite(profile.frame_rate) || 30;
  const objective = text(
    brief.creative_objective ||
    brief.business_goal ||
    project.objective ||
    mission.objective ||
    mission.business_goal ||
    plan.concept?.message,
  );

  return {
    workflow_kind: workflowKind(plan),
    duration_seconds: duration,
    channels,
    profile_id: profileId || (vertical ? "master-vertical-h264" : "master-landscape-h264"),
    width,
    height,
    frame_rate: frameRate,
    aspect_ratio: `${width}:${height}`,
    objective,
  };
}

function completeConcept(plan, context, repairs) {
  const source = object(plan.concept);
  const message = completedText(
    source.message,
    context.objective || "Make the audience understand the specific value proven by the selected real assets.",
    15,
    repairs,
    "concept.message",
  );
  return {
    ...source,
    title: completedText(
      source.title,
      "A precise, ownable creative idea built from verified brand and venue evidence",
      15,
      repairs,
      "concept.title",
    ),
    creative_thesis: completedText(
      source.creative_thesis,
      `Turn the verified real-world evidence into one clear audience promise: ${message}`,
      15,
      repairs,
      "concept.creative_thesis",
    ),
    hook: completedText(
      source.hook,
      "Open on an immediate visual contradiction or action that makes the viewer stop and understand the setting without exposition",
      15,
      repairs,
      "concept.hook",
    ),
    message,
    narrative: completedText(
      source.narrative,
      `Progress from curiosity to visible proof and finish with an earned invitation connected directly to ${message}`,
      15,
      repairs,
      "concept.narrative",
    ),
    visual_system: completedText(
      source.visual_system,
      "Use the verified asset palette, natural venue texture, controlled contrast, legible external typography and composition designed for the selected channel safe area",
      15,
      repairs,
      "concept.visual_system",
    ),
    emotional_promise: completedText(
      source.emotional_promise,
      "The viewer should feel that the experience is real, socially inviting and worth choosing now rather than merely being advertised",
      15,
      repairs,
      "concept.emotional_promise",
    ),
    call_to_action: completedText(
      source.call_to_action,
      "End with a restrained, verifiable invitation that follows naturally from the visible proof and does not introduce an unsupported claim",
      15,
      repairs,
      "concept.call_to_action",
    ),
  };
}

function completeStory(plan, concept, repairs) {
  const source = object(plan.story);
  const fields = {
    hook: `Begin with ${concept.hook} and reveal enough context in the first beat to reward immediate attention.`,
    audience_tension: "The audience wants a credible place or experience worth their limited time, but generic promotional claims do not provide trustworthy proof.",
    escalation: "Increase conviction through distinct, verified visual evidence; each new beat must add information rather than repeat atmosphere.",
    observable_proof: "Use the selected original assets as observable proof of identity, product, place or activity, preserving their factual content and recognisable details.",
    turn: "Shift from passive observation to a human or spatial cue that makes the viewer imagine participating in the experience.",
    resolution: `Resolve the tension by connecting the accumulated proof to this message: ${concept.message}`,
    call_to_action: concept.call_to_action,
    emotional_arc: "Move from curiosity to recognition, then confidence, desire and a calm sense that taking the next action is justified.",
    anti_cliche_strategy: "Avoid generic montage rhythm, unsupported superlatives, repeated beauty shots and AI spectacle; every edit must reveal specific new evidence.",
  };
  return Object.fromEntries(Object.entries(fields).map(([field, fallback]) => [
    field,
    completedText(source[field], fallback, 20, repairs, `story.${field}`),
  ])).reduce((result, [key, value]) => ({ ...result, [key]: value }), {
    ...source,
  });
}

function completeDeliverables(plan, context, repairs) {
  const deliverables = list(plan.deliverables);
  return deliverables.map((deliverable, index) => {
    const source = object(deliverable);
    const outputSpec = object(source.output_spec);
    if (!Object.keys(outputSpec).length) repairs.push(`deliverables.${index}.output_spec`);
    return {
      ...source,
      id: completedText(
        source.id,
        `deliverable-${index + 1}`,
        3,
        repairs,
        `deliverables.${index}.id`,
      ),
      type: completedText(
        source.type,
        context.workflow_kind === "TEMPORAL" ? "VIDEO" : context.workflow_kind,
        3,
        repairs,
        `deliverables.${index}.type`,
      ),
      purpose: completedText(
        source.purpose,
        "Deliver the approved creative idea in the requested channel format with preserved brand truth and measurable audience intent",
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
        ...outputSpec,
      },
    };
  });
}

function roleApplies(role, workflow) {
  return role.applies_to.includes("ALL") || role.applies_to.includes(workflow);
}

function completeRoleDecisions(plan, context, repairs) {
  const source = object(plan.role_decisions);
  const result = { ...source };
  for (const role of CREATIVE_AGENCY_ROLES) {
    const current = object(source[role.id]);
    const applies = roleApplies(role, context.workflow_kind);
    const status = ["ACTIVE", "NOT_REQUIRED"].includes(upper(current.status))
      ? upper(current.status)
      : applies ? "ACTIVE" : "NOT_REQUIRED";
    if (status !== upper(current.status)) repairs.push(`role_decisions.${role.id}.status`);
    if (status === "NOT_REQUIRED") {
      result[role.id] = { ...current, status };
      continue;
    }
    const evidence = list(current.evidence).length
      ? current.evidence
      : [
          "Validated creative brief and requested channel",
          "Verified selected-asset manifest and asset intelligence",
          "Validated company and market research report",
        ];
    if (!list(current.evidence).length) repairs.push(`role_decisions.${role.id}.evidence`);
    const confidence = finite(current.confidence);
    if (confidence === null || confidence < 0 || confidence > 100) {
      repairs.push(`role_decisions.${role.id}.confidence`);
    }
    result[role.id] = {
      ...current,
      status,
      decision: completedText(
        current.decision,
        `${role.mandate} Apply that mandate to the approved objective and require evidence before any production or release decision.`,
        20,
        repairs,
        `role_decisions.${role.id}.decision`,
      ),
      evidence,
      confidence: confidence !== null && confidence >= 0 && confidence <= 100
        ? confidence
        : 82,
      risks: list(current.risks).length
        ? current.risks
        : ["Loss of specificity, continuity or evidence at execution time"],
      repair_instructions: list(current.repair_instructions).length
        ? current.repair_instructions
        : ["Return only to the affected role decision and repair it against the approved evidence without changing unrelated creative choices"],
    };
  }
  return result;
}

function shotOutputSpec(shot, context) {
  const generation = object(shot.generation);
  return {
    duration_seconds: finite(shot.duration_seconds) || context.duration_seconds,
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
    ...object(generation.output_spec),
  };
}

function completeShot(shot, scene, sceneIndex, shotIndex, context, repairs) {
  const source = object(shot);
  const base = `scenes.${sceneIndex}.shots.${shotIndex}`;
  const title = completedText(
    source.title,
    `Evidence beat ${sceneIndex + 1}.${shotIndex + 1}`,
    8,
    repairs,
    `${base}.title`,
  );
  const subject = completedText(
    source.subject,
    "The exact verified subject assigned to this shot, shown with recognisable identity and contextual detail",
    8,
    repairs,
    `${base}.subject`,
  );
  const action = completedText(
    source.action,
    `Show ${subject.toLowerCase()} completing one clear visible action that advances the scene objective rather than posing for an advertisement`,
    20,
    repairs,
    `${base}.action`,
  );
  const performance = completedText(
    source.performance,
    "Keep micro-behaviour observational and physically credible: natural timing, brief eye movement, weight transfer, hand contact and reaction appropriate to the action",
    20,
    repairs,
    `${base}.performance`,
  );
  const duration = finite(source.duration_seconds) || Math.max(
    1,
    finite(scene.duration_seconds) || context.duration_seconds,
  );
  if (!finite(source.duration_seconds)) repairs.push(`${base}.duration_seconds`);

  const frameSource = object(source.frame_plan);
  const framePlan = {
    ...frameSource,
    opening_frame: completedText(
      frameSource.opening_frame,
      `Open on a complete ${context.aspect_ratio} composition that establishes ${subject}, its spatial context, motivated light and the initial state before the action begins`,
      30,
      repairs,
      `${base}.frame_plan.opening_frame`,
    ),
    progression: completedText(
      frameSource.progression,
      `Across ${duration} seconds, let the action unfold in readable stages with stable identity, object permanence, motivated camera movement and one new piece of story evidence at each beat`,
      40,
      repairs,
      `${base}.frame_plan.progression`,
    ),
    closing_frame: completedText(
      frameSource.closing_frame,
      "Close only after the action produces a visible changed state; preserve screen direction, location geography and enough negative space for externally rendered graphics",
      30,
      repairs,
      `${base}.frame_plan.closing_frame`,
    ),
  };

  const cameraSource = object(source.camera);
  const cameraFallbacks = {
    framing: "Purposeful medium-wide framing with the subject and evidence readable in the vertical safe area",
    angle: "Natural eye-level or motivated low angle that preserves credible spatial relationships",
    camera_distance: "Close enough to read the action while retaining environmental proof around the subject",
    lens_intent: "Natural perspective with restrained depth separation and no synthetic ultra-wide distortion",
    movement_path: "A single motivated push, lateral reveal or locked observation aligned with the subject action",
    movement_speed: "Slow acceleration and deceleration with no abrupt or mechanically perfect motion",
    stabilization: "Controlled gimbal or tripod movement with slight physical realism where appropriate",
    movement_motivation: "Move only to reveal new evidence, follow the action or transfer attention to the changed state",
    focus_target: "Hold focus on the exact subject detail that proves the current story beat",
    focus_transition: "Use one motivated focus transfer only when attention must pass to newly revealed evidence",
  };
  const camera = { ...cameraSource };
  for (const [field, fallback] of Object.entries(cameraFallbacks)) {
    camera[field] = completedText(
      cameraSource[field],
      fallback,
      5,
      repairs,
      `${base}.camera.${field}`,
    );
  }

  const lightingSource = object(source.lighting);
  const lightingFallbacks = {
    source: "Use the existing motivated venue or daylight source and supplement invisibly rather than inventing unmotivated glow",
    direction: "Preserve the observed source direction, natural falloff and contact shadows across the complete shot",
    contrast: "Keep readable subject separation while retaining real shadow detail and practical-light contrast",
    colour: "Match the verified asset colour temperature and protect skin, food, product and brand colours from drift",
    exposure_intent: "Protect highlights, retain textured blacks and expose the primary proof detail consistently through movement",
  };
  const lighting = { ...lightingSource };
  for (const [field, fallback] of Object.entries(lightingFallbacks)) {
    lighting[field] = completedText(
      lightingSource[field],
      fallback,
      5,
      repairs,
      `${base}.lighting.${field}`,
    );
  }

  const designSource = object(source.production_design);
  const designFallbacks = {
    environment: "Preserve the verified environment layout, signage, furniture and spatial character without adding invented venue features",
    wardrobe: "Keep existing wardrobe and grooming unchanged unless the verified source explicitly supports another choice",
    props: "Use only action-relevant verified props and maintain their exact count, orientation and contact state",
    materials: "Preserve credible wood, metal, glass, fabric, skin and food response under the motivated lighting",
    texture_detail: "Retain small imperfections, surface wear, condensation, crumbs, reflections and contact detail that prevent synthetic smoothness",
  };
  const productionDesign = { ...designSource };
  for (const [field, fallback] of Object.entries(designFallbacks)) {
    productionDesign[field] = completedText(
      designSource[field],
      fallback,
      5,
      repairs,
      `${base}.production_design.${field}`,
    );
  }

  const continuitySource = object(source.continuity);
  const continuityFallbacks = {
    identity: "Preserve exact facial, body, clothing and distinguishing identity anchors from approved references",
    product: "Preserve exact product shape, portion, colour, branding and placement through every frame",
    location: "Preserve venue architecture, furniture, signage, lighting positions and background geography",
    wardrobe: "Preserve wardrobe, accessories, grooming and fabric behaviour without frame-to-frame mutation",
    screen_direction: "Maintain established eyelines and left-to-right or right-to-left action direction through the edit",
    spatial_geography: "Keep subject, props and camera on a coherent map with stable distance, scale and contact relationships",
  };
  const continuity = { ...continuitySource };
  for (const [field, fallback] of Object.entries(continuityFallbacks)) {
    continuity[field] = completedText(
      continuitySource[field],
      fallback,
      5,
      repairs,
      `${base}.continuity.${field}`,
    );
  }

  const audioSource = object(source.audio);
  const audio = {
    ...audioSource,
    source_sound: completedText(
      audioSource.source_sound,
      "Use location-authentic room tone and action-synchronised source sound tied to visible contact and movement",
      5,
      repairs,
      `${base}.audio.source_sound`,
    ),
    mix_intent: completedText(
      audioSource.mix_intent,
      "Keep the proof action and human presence forward, ambience supportive, music restrained and every transition free from masking or abrupt loudness changes",
      10,
      repairs,
      `${base}.audio.mix_intent`,
    ),
  };

  const negativeConstraints = unique([
    ...list(source.negative_constraints),
    "Do not change, regenerate or approximate recognisable people, logos, venue architecture, food, products or other verified source identity",
    "No malformed anatomy, duplicated objects, floating contact, impossible reflections, shadow discontinuity or frame-to-frame object mutation",
    "No generated typography, fake logos, invented offers, unverified claims, watermarks, subtitles or legal text inside generated pixels",
    "No excessive camera motion, synthetic depth warping, plastic texture, over-smoothed skin, artificial bokeh or generic AI-commercial styling",
  ]);
  if (!list(source.negative_constraints).length) repairs.push(`${base}.negative_constraints`);

  const repairInstructions = unique([
    ...list(source.repair_instructions),
    "Repair only the failed region or time range; preserve every approved frame, identity anchor, action beat and continuity relationship outside that boundary",
    "Re-run the failed shot against the same references, seed and output specification, then compare opening, progression and closing frames before accepting it",
    "Reject the repair when it introduces a new identity, product, location, physics, text, audio or continuity defect even if the original defect is removed",
  ]);
  if (!list(source.repair_instructions).length) repairs.push(`${base}.repair_instructions`);

  const generationSource = object(source.generation);
  const providerPrompt = completedText(
    generationSource.provider_prompt,
    [
      `Create a ${duration}-second ${context.aspect_ratio} shot titled ${title}.`,
      `Subject: ${subject}.`,
      `Action: ${action}.`,
      `Performance: ${performance}.`,
      `Opening: ${framePlan.opening_frame}.`,
      `Progression: ${framePlan.progression}.`,
      `Closing: ${framePlan.closing_frame}.`,
      `Camera: ${camera.framing}; ${camera.angle}; ${camera.movement_path}; focus on ${camera.focus_target}.`,
      `Lighting: ${lighting.source}; ${lighting.direction}; ${lighting.exposure_intent}.`,
      `Continuity: ${continuity.identity}; ${continuity.product}; ${continuity.location}.`,
      "Respect every supplied reference as a binding identity and factual continuity source.",
    ].join(" "),
    120,
    repairs,
    `${base}.generation.provider_prompt`,
  );
  const negativePrompt = completedText(
    generationSource.negative_prompt,
    negativeConstraints.join("; "),
    40,
    repairs,
    `${base}.generation.negative_prompt`,
  );
  const outputSpec = shotOutputSpec({ ...source, duration_seconds: duration }, context);
  if (!Object.keys(object(generationSource.output_spec)).length) {
    repairs.push(`${base}.generation.output_spec`);
  }

  return {
    ...source,
    id: text(source.id) || `scene-${sceneIndex + 1}-shot-${shotIndex + 1}`,
    title,
    purpose: completedText(
      source.purpose,
      `Advance the scene by delivering distinct visible evidence for ${text(scene.objective) || context.objective}`,
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
    transition_in: completedText(
      source.transition_in,
      "Enter on matched movement, motivated sound or a visual detail inherited from the preceding beat",
      8,
      repairs,
      `${base}.transition_in`,
    ),
    transition_out: completedText(
      source.transition_out,
      "Leave on the completed action or changed state that causally motivates the following beat",
      8,
      repairs,
      `${base}.transition_out`,
    ),
    negative_constraints: negativeConstraints,
    known_failure_modes: unique([
      ...list(source.known_failure_modes),
      "Identity or source-asset drift",
      "Object permanence, contact, reflection or shadow discontinuity",
      "Generated text or logo corruption",
      "Generic pacing or repeated story information",
    ]),
    repair_instructions: repairInstructions,
    generation: {
      ...generationSource,
      required: generationSource.required !== false,
      service: text(generationSource.service) || "ai.video.generate",
      capability: text(generationSource.capability) || "ai.video.generate",
      provider_prompt: providerPrompt,
      negative_prompt: negativePrompt,
      output_spec: outputSpec,
    },
  };
}

function completeScenes(plan, context, repairs) {
  return list(plan.scenes).map((scene, sceneIndex) => {
    const source = object(scene);
    const base = `scenes.${sceneIndex}`;
    const objective = completedText(
      source.objective,
      `Deliver a distinct piece of visible evidence that advances the audience from the previous story state toward ${context.objective}`,
      20,
      repairs,
      `${base}.objective`,
    );
    const stateBefore = completedText(
      source.story_state_before,
      "The audience has the preceding level of knowledge and has not yet seen the specific proof assigned to this scene",
      20,
      repairs,
      `${base}.story_state_before`,
    );
    const stateChange = completedText(
      source.state_change,
      `The audience observes new, verifiable evidence through this scene objective: ${objective}`,
      20,
      repairs,
      `${base}.state_change`,
    );
    const stateAfter = completedText(
      source.story_state_after,
      "The audience now has one additional concrete reason to trust the message and is prepared for the next causal beat",
      20,
      repairs,
      `${base}.story_state_after`,
    );
    const completedScene = {
      ...source,
      id: text(source.id) || `scene-${sceneIndex + 1}`,
      title: completedText(
        source.title,
        `Proof transition ${sceneIndex + 1}`,
        8,
        repairs,
        `${base}.title`,
      ),
      objective,
      story_state_before: stateBefore,
      state_change: stateChange,
      story_state_after: stateAfter,
      transition_logic: completedText(
        source.transition_logic,
        "The changed audience knowledge creates the reason and visual bridge for the next scene rather than cutting to unrelated atmosphere",
        15,
        repairs,
        `${base}.transition_logic`,
      ),
    };
    return {
      ...completedScene,
      shots: list(source.shots).map((shot, shotIndex) =>
        completeShot(
          shot,
          completedScene,
          sceneIndex,
          shotIndex,
          context,
          repairs,
        )),
    };
  });
}

export const CreativeMasterPlanCompletionRuntime = {
  complete({ plan = {}, mission = {}, project = {}, brief = {}, assets = [] } = {}) {
    const repairs = [];
    const source = object(plan);
    const context = contextFor({ plan: source, mission, project, brief, assets });
    const concept = completeConcept(source, context, repairs);
    const completed = {
      ...source,
      workflow_kind: context.workflow_kind,
      concept,
      story: completeStory(source, concept, repairs),
      deliverables: completeDeliverables(source, context, repairs),
      role_decisions: completeRoleDecisions(source, context, repairs),
      scenes: completeScenes(source, context, repairs),
      quality: object(source.quality),
      completion: {
        contract: "CREATIVE_MASTER_PLAN_COMPLETION_V1",
        mode: "DETERMINISTIC_SCHEMA_COMPLETION",
        preserved_provider_direction: true,
        repaired_field_count: repairs.length,
        repaired_fields: unique(repairs),
        completed_at: new Date().toISOString(),
      },
    };
    return completed;
  },
};
