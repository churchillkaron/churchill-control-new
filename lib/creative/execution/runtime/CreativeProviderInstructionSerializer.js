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

function boundedReviewValue(value, { maxItems = 8, maxChars = 900 } = {}) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return text(value).slice(0, maxChars);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, maxItems).map((item) => boundedReviewValue(item, { maxItems: 4, maxChars: 360 }));
  }
  if (typeof value !== "object") return null;
  const output = {};
  for (const [key, child] of Object.entries(value).slice(0, maxItems)) {
    output[key] = boundedReviewValue(child, { maxItems: 4, maxChars: 360 });
  }
  return output;
}

function compactReviewContract(context = {}) {
  const r = object(context.requirements);
  const frame = object(r.frame_plan || context.frame_contract);
  const continuity = object(r.continuity_bible || r.continuity);
  const identity = object(r.identity_requirements || context.identity_lock);
  const product = object(r.product_requirements);
  return {
    subject: boundedReviewValue(r.subject),
    action: boundedReviewValue(r.action),
    purpose: boundedReviewValue(r.purpose || r.human_purpose),
    location: boundedReviewValue(r.location),
    camera: boundedReviewValue(r.camera),
    lighting: boundedReviewValue(r.lighting),
    production_design: boundedReviewValue(r.production_design),
    opening_frame: boundedReviewValue(r.opening_frame || frame.opening_frame),
    progression: boundedReviewValue(r.progression_frames || frame.progression),
    closing_frame: boundedReviewValue(r.closing_frame || frame.closing_frame),
    continuity: boundedReviewValue(continuity),
    identity: boundedReviewValue(identity),
    product: boundedReviewValue(product),
    must_avoid: boundedReviewValue(r.must_avoid || r.negative_constraints || r.known_failure_modes),
    minimum_quality: boundedReviewValue(r.minimum_quality),
    output_spec: boundedReviewValue(context.output_spec),
    repair_evaluation: boundedReviewValue(context.repair_evaluation),
  };
}

function reviewInstruction(input = {}, context = {}) {
  return [
    "Inspect the supplied generated media against the immutable approved shot contract.",
    "Return strict JSON only with passed, scores, failures, evidence, affected_timestamps, and repair_instructions.",
    "Score overall, story, environment, camera, anatomy, identity, product_fidelity, music_energy, performance, continuity, physics, and artifacts from 0 to 100.",
    "Fail closed on missing evidence, identity drift, anatomy defects, synthetic artifacts, implausible physics, broken continuity, wrong camera/environment/product/brand execution, unreadable media, or generic AI-looking results.",
    "For video, inspect opening, progression, and closing states. Require meaningful visual progress, stable geometry, motivated camera movement, credible materials/light/contact, and deliberate depth.",
    section("Compact immutable review contract", compactReviewContract(context)),
  ].filter(Boolean).join("\n\n").slice(0, 9000);
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

function visualInstruction(input = {}, context = {}) {
  const repairSpecification = object(context.repair_specification);
  const targetedRepair = Object.keys(repairSpecification).length > 0;

  return [
    "Execute the following shot as a premium, photoreal, production-ready commercial image or video.",
    targetedRepair
      ? "TARGETED QA REPAIR: preserve every approved source asset and every requirement that previously passed. Change only the failed requirements identified by the structured repair specification. Execute every repair instruction and focus area exactly, and do not regress identity, continuity, environment, camera, performance, product fidelity, story, physics, anatomy, artifact quality, or music-energy requirements that already passed."
      : null,
    "Treat every structured field as binding: story purpose, visible subject, exact action over time, performance, opening/progression/closing frames, camera, lighting, production design, continuity, source-asset identity, sound intent, output specification, negative constraints, failure modes, and repair rules.",
    "Camera movement must be motivated by the action and must end on the specified changed story state. Preserve approved real identities and source assets exactly when the contract requires them. Do not invent extra people, logos, products, text, props, architecture, or events.",
    "Avoid generic AI beauty, synthetic skin, warped anatomy, drifting identity, floating objects, implausible motion, decorative camera movement, overprocessed color, fake venue details, and any result that looks computer-generated.",
    section("Targeted QA repair specification", repairSpecification),
    section("Structured shot contract", {
      ...context,
      repair_specification: undefined,
      repair_evaluation: undefined,
    }),
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
    return visualInstruction(input, context);
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