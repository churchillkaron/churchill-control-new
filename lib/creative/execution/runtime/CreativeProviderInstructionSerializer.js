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
    repair_contract: object(input.repair_contract),
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
    section("Structured review contract", {
      intent: context.intent,
      requirements: context.requirements,
      output_spec: context.output_spec,
      provider_parameters: context.provider_parameters,
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

function visualInstruction(input = {}, context = {}) {
  return [
    "Execute the following shot as a premium, photoreal, production-ready commercial image or video.",
    "Treat every structured field as binding: story purpose, visible subject, exact action over time, performance, opening/progression/closing frames, camera, lighting, production design, continuity, source-asset identity, sound intent, output specification, negative constraints, failure modes, and repair rules.",
    "Camera movement must be motivated by the action and must end on the specified changed story state. Preserve approved real identities and source assets exactly when the contract requires them. Do not invent extra people, logos, products, text, props, architecture, or events.",
    "Avoid generic AI beauty, synthetic skin, warped anatomy, drifting identity, floating objects, implausible motion, decorative camera movement, overprocessed color, fake venue details, and any result that looks computer-generated.",
    section("Structured shot contract", context),
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
      Object.keys(context.output_spec).length,
  );
}

export const CreativeProviderInstructionSerializer = Object.freeze({
  serialize: serializeCreativeProviderInstruction,
  hasStructuredInstruction: hasStructuredCreativeInstruction,
  contract: "CREATIVE_PROVIDER_INSTRUCTION_SERIALIZATION_V1",
  persistence_boundary: "EXECUTION_TRANSPORT_ONLY",
});
