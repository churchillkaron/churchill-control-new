const FORBIDDEN_KEYS = new Set([
  "prompt",
  "provider_prompt",
  "generation_prompt",
  "visual_prompt",
  "video_prompt",
  "image_prompt",
  "music_prompt",
  "negative_prompt",
  "system_prompt",
  "developer_prompt",
  "user_prompt",
  "prompt_template",
  "prompt_text",
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

function normalizedKey(value) {
  return text(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replaceAll("-", "_")
    .toLowerCase();
}

function sanitized(value, depth = 0) {
  if (depth > 8) return "[depth-limited]";
  if (Array.isArray(value)) {
    return value.map((item) => sanitized(item, depth + 1));
  }
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !FORBIDDEN_KEYS.has(normalizedKey(key)))
      .map(([key, child]) => [key, sanitized(child, depth + 1)]),
  );
}

function compactJson(value) {
  const clean = sanitized(value);
  if (clean === undefined || clean === null) return "";
  if (typeof clean === "string") return text(clean);
  if (Array.isArray(clean) && !clean.length) return "";
  if (typeof clean === "object" && !Object.keys(clean).length) return "";
  return JSON.stringify(clean);
}

function section(label, value) {
  const serialized = compactJson(value);
  return serialized ? `${label}: ${serialized}` : null;
}

function capability(input = {}) {
  return text(
    input.capability ||
      input.service_id ||
      input.service_code ||
      input.generation?.capability ||
      input.generation?.service,
  ).toLowerCase();
}

function nodeType(input = {}) {
  return text(
    input.node_type ||
      input.type ||
      input.metadata?.node_type,
  ).toUpperCase();
}

function explicitInstruction(input = {}) {
  return text(
    input.prompt ||
      input.provider_prompt ||
      input.instructions?.prompt ||
      input.generation?.provider_prompt,
  );
}

function creativeContext(input = {}) {
  const generation = object(input.generation);
  const requirements = object(input.requirements);
  const intent = object(input.intent);
  return {
    node_id: input.node_id || input.metadata?.execution_node_id || null,
    node_type: nodeType(input) || null,
    title: input.title || null,
    description: input.description || null,
    intent,
    requirements,
    frame_contract: object(input.frame_contract),
    output_spec:
      Object.keys(object(input.output_spec)).length
        ? object(input.output_spec)
        : object(generation.output_spec),
    provider_parameters: {
      ...object(generation.provider_parameters),
      ...object(input.provider_parameters),
    },
    // Only output_spec and provider_parameters were read out of `generation`, so
    // two bindings that live there never reached the provider. The instruction text
    // asserts "Preserve approved real identities and source assets exactly when the
    // contract requires them" and treats repair rules as binding -- while the
    // contract saying so was left out. Verified against the most recent
    // ai.video.generate task: identity_lock and repair_instructions were present in
    // the task input and absent from the derived instruction.
    //
    // Dropping identity_lock is the serious one. It carries the instruction not to
    // alter facial geometry, skin tone, age or body proportions for a real person,
    // and losing it silently is how identity drift reaches a finished frame.
    //
    // The rest of `generation` stays out on purpose: model, provider, status,
    // estimated_cost, estimated_seconds and provider_prompt_persisted are transport
    // and billing detail, not creative direction, and belong nowhere in a provider
    // instruction. A top-level value wins over the nested one, matching how
    // output_spec and provider_parameters already resolve.
    identity_lock: Object.keys(object(input.identity_lock)).length
      ? object(input.identity_lock)
      : object(generation.identity_lock),
    repair_instructions: list(input.repair_instructions).length
      ? list(input.repair_instructions)
      : list(generation.repair_instructions),
    repair_contract: object(input.repair_contract),
    repair_specification: object(input.repair_specification),
    repair_evaluation: object(input.repair_evaluation),
    source_assets: list(input.source_assets),
    reference_assets: list(input.reference_assets),
    reference_asset_ids: list(input.reference_asset_ids),
    metadata: object(input.metadata),
  };
}

function reviewInstruction(input = {}, context = {}) {
  return [
    "Inspect the supplied generated media against the immutable structured production contract below.",
    "Return strict JSON only. Do not describe your reasoning outside the JSON result.",
    "Reject identity drift, anatomy defects, synthetic artifacts, implausible physics, broken continuity, incorrect camera execution, weak story evidence, wrong environment, product or brand errors, and violations of any negative constraint.",
    "The result must contain passed, scores, failures, and repair_instructions fields compatible with the requested output specification.",
    Object.keys(context.repair_evaluation).length
      ? "This is a replacement-media review. Evaluate the repaired output against both the original immutable requirements and the targeted repair evaluation contract. Reject regressions in requirements that previously passed."
      : null,
    section("Targeted repair evaluation contract", context.repair_evaluation),
    section("Structured review contract", {
      intent: context.intent,
      requirements: context.requirements,
      output_spec: context.output_spec,
      provider_parameters: context.provider_parameters,
      repair_contract: context.repair_contract,
      metadata: context.metadata,
    }),
  ].filter(Boolean).join("\n\n");
}

function musicInstruction(input = {}, context = {}) {
  const duration = Number(
    input.duration_seconds ||
      context.output_spec?.duration_seconds ||
      context.provider_parameters?.duration_seconds ||
      0,
  );
  return [
    `Create an original ${duration > 0 ? `${duration}-second ` : ""}instrumental editorial soundtrack from the structured production contract below.`,
    "Support the film's complete emotional and editorial arc while leaving space for venue ambience, action-synchronised sound effects, and dialogue if present.",
    "Use an immediate, intentional opening, controlled internal progression, one memorable lift, and a decisive non-truncated ending.",
    "Do not imitate a protected artist or composition. No recognisable copyrighted melody, vocals, spoken words, generic corporate uplift, trailer braams, stock-music cliches, or accidental looping.",
    section("Structured soundtrack contract", context),
  ].filter(Boolean).join("\n\n");
}

function visualInstruction(input = {}, context = {}, service = "") {
  const repairSpecification = object(context.repair_specification);
  const targetedRepair = Object.keys(repairSpecification).length > 0;
  const imageOnly = text(service).includes("image");
  const requirements = object(context.requirements);
  const intent = object(context.intent);
  const structuredVisualContract = imageOnly
    ? {
        title: context.title || null,
        description: context.description || null,
        intent: {
          subject: intent.subject || requirements.subject || null,
          action: intent.action || requirements.action || null,
          purpose: intent.purpose || requirements.purpose || null,
          opening_frame: intent.opening_frame || requirements.opening_frame || null,
        },
        camera: requirements.camera || null,
        lighting: requirements.lighting || null,
        location: requirements.location || null,
        performance: requirements.performance || null,
        production_design: requirements.production_design || null,
        negative_constraints: requirements.negative_constraints || requirements.must_avoid || [],
        visual_production_mode: requirements.visual_production_mode || context.provider_parameters?.visual_production_mode || null,
        visual_transformation_policy: requirements.visual_transformation_policy || null,
        primary_source_asset_id: requirements.primary_source_asset_id || context.provider_parameters?.primary_source_asset_id || null,
        source_truth: requirements.creative_grounding || null,
        output_spec: context.output_spec,
        provider_parameters: {
          width: context.provider_parameters?.width || null,
          height: context.provider_parameters?.height || null,
          aspect_ratio: context.provider_parameters?.aspect_ratio || context.output_spec?.aspect_ratio || null,
          inference_steps: context.provider_parameters?.inference_steps || null,
        },
      }
    : {
        ...context,
        repair_specification: undefined,
        repair_evaluation: undefined,
      };

  return [
    "Execute the following shot as a premium, photoreal, production-ready commercial image or video.",
    "PREMIUM VISUAL LANGUAGE IS OBSERVABLE, NOT AN ADJECTIVE: create a deliberate focal hierarchy, controlled highlight-to-shadow structure, foreground/midground/background separation, material texture, atmospheric depth, intentional negative space, motivated practical or natural light, and composition that directs the eye immediately. Flat exposure, evenly distributed attention, dead backgrounds, generic stock framing, decorative blur, arbitrary symmetry and empty visual space without story purpose are release failures.",
    "Translate the structured emotional intent into visible cinematography. When the story calls for tension, mystery, anticipation, power, beauty or awe, earn it through partial reveal, occlusion, silhouette, scale contrast, light emerging from darkness, off-axis framing, layered depth, human behavior, environmental motion or another physically credible device. Do not merely add dramatic adjectives, random haze, neon, lens flares or spectacle.",
    "ENVIRONMENTAL ALIVENESS: a real operating world must feel inhabited and causally active at the level required by the shot. Use credible people, task behavior, secondary motion, practical light sources, weather, machinery or service activity only when supported by the contract. A nightclub, office, hotel, restaurant, factory, street or venue that should be operating but reads as empty, staged or showroom-clean must fail.",
    "REFERENCE POLICY: use approved references as truth anchors for geography, architecture, product, brand, identity, materials and real-world plausibility. In CINEMATIC_RECONSTRUCTION or ORIGINAL_WORLD_BUILDING, do not inherit a weak reference composition merely because it is available; redesign the frame while preserving every truth the source is meant to prove.",
    "COMMERCIAL BEAUTY FLOOR: the frame must be worth showing before motion is added. It should read as an elite high-end commercial cinema frame with a clear visual point of view, not like a technically correct AI render. Beauty cannot override truth, but truth cannot excuse flat, cheap or generic presentation.",
    targetedRepair
      ? "TARGETED QA REPAIR: preserve every approved source asset and every requirement that previously passed. Change only the failed requirements identified by the structured repair specification. Execute every repair instruction and focus area exactly, and do not regress identity, continuity, environment, camera, performance, product fidelity, story, physics, anatomy, artifact quality, or music-energy requirements that already passed."
      : null,
    "Treat every structured field as binding: story purpose, visible subject, exact action over time, performance, opening/progression/closing frames, camera, lighting, production design, continuity, source-asset identity, sound intent, output specification, negative constraints, failure modes, and repair rules.",
    "Camera movement must be motivated by the action and must end on the specified changed story state. Preserve approved real identities and source assets exactly when the contract requires them. Do not invent extra people, logos, products, text, props, architecture, or events. The filming apparatus is never part of the depicted world unless explicitly required: no photographer, camera operator, cinema camera, flash unit, tripod, boom, lighting crew, production crew, behind-the-scenes framing or visible recording device.",
    "Avoid generic AI beauty, synthetic skin, warped anatomy, drifting identity, floating objects, implausible motion, decorative camera movement, overprocessed color, fake venue details, and any result that looks computer-generated.",
    section("Targeted QA repair specification", repairSpecification),
    section(imageOnly ? "Compact cinematic frame contract" : "Structured shot contract", structuredVisualContract),
  ].filter(Boolean).join("\n\n");
}

function genericInstruction(input = {}, context = {}) {
  return [
    "Execute the following immutable structured production instruction.",
    section("Structured production contract", context),
  ].filter(Boolean).join("\n\n");
}

export function serializeCreativeProviderInstruction(input = {}) {
  const explicit = explicitInstruction(input);
  if (explicit) return explicit;

  const context = creativeContext(input);
  const service = capability(input);
  const type = nodeType(input);

  if (
    service.includes(".analyze") ||
    service.includes(".validate") ||
    service.includes(".review") ||
    service.includes("quality") ||
    /REVIEW|VALIDATION|QUALITY/.test(type)
  ) {
    return reviewInstruction(input, context);
  }
  if (service.includes("music") || type.includes("SOUNDTRACK")) {
    return musicInstruction(input, context);
  }
  if (
    service.includes("video") ||
    service.includes("image") ||
    /SHOT|KEYFRAME|MOTION_PLATE/.test(type)
  ) {
    return visualInstruction(input, context, service);
  }
  return genericInstruction(input, context);
}

export function hasStructuredCreativeInstruction(input = {}) {
  const context = creativeContext(input);
  return Boolean(
    text(context.title) ||
      text(context.description) ||
      Object.keys(context.intent).length ||
      Object.keys(context.requirements).length ||
      Object.keys(context.frame_contract).length ||
      Object.keys(context.output_spec).length ||
      Object.keys(context.repair_specification).length ||
      Object.keys(context.repair_evaluation).length,
  );
}

export const CreativeProviderInstructionSerializer = Object.freeze({
  serialize: serializeCreativeProviderInstruction,
  hasStructuredInstruction: hasStructuredCreativeInstruction,
  contract: "CREATIVE_PROVIDER_INSTRUCTION_SERIALIZATION_V1",
  persistence_boundary: "EXECUTION_TRANSPORT_ONLY",
});