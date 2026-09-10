function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

const SAFE_LABELS = new Set([
  "subject",
  "action",
  "opening frame",
  "opening state",
  "progression",
  "closing frame",
  "closing state",
]);

const BLOCKED_MARKERS = [
  "previous_",
  "previous ",
  "purpose:",
  "camera:",
  "lighting:",
  "continuity:",
  "truth checks:",
  "subject truth checks:",
  "reject",
  "rejection",
  "metadata",
  "json",
  "uuid",
  "no text",
  "no typography",
  "no captions",
  "no logos",
  "no ui",
];

function safePhrase(value) {
  const phrase = text(value);
  if (!phrase) return "";
  const lower = phrase.toLowerCase();
  if (BLOCKED_MARKERS.some((marker) => lower.includes(marker))) return "";
  if (/[{}\[\]]/.test(phrase)) return "";
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(phrase)) return "";
  if (/\b[a-z][a-z0-9]*_[a-z0-9_]+\b/i.test(phrase)) return "";
  return phrase.slice(0, 420).trim();
}

function pushUnique(target, value) {
  const phrase = safePhrase(value);
  if (phrase && !target.includes(phrase)) target.push(phrase);
}

function parseStructuredValues(raw, target) {
  const separator = raw.indexOf(":");
  if (separator < 0) return false;
  const label = text(raw.slice(0, separator)).toLowerCase();
  const body = raw.slice(separator + 1).trim();
  if (label === "camera" || label === "lighting") {
    try {
      const parsed = JSON.parse(body);
      for (const value of Object.values(object(parsed))) pushUnique(target, value);
    } catch {
      // Malformed structured repair rows are ignored rather than leaked.
    }
    return true;
  }
  if (label === "continuity" || label.includes("truth") || label.startsWith("reject") || label === "purpose") {
    return true;
  }
  if (SAFE_LABELS.has(label)) {
    pushUnique(target, body);
    return true;
  }
  return false;
}

function repairRows(input = {}) {
  const specification = object(input.repair_specification);
  const contract = object(input.repair_contract);
  return [
    ...list(specification.required_repairs),
    ...list(contract.instructions),
  ].map(text).filter(Boolean);
}

function visualAnchorPhrases(input = {}, target = []) {
  const requirements = object(input.requirements);
  const continuityBible = object(requirements.continuity_bible);
  const subjectLock = object(requirements.persistent_subject_lock);
  for (const value of [
    requirements.generator_visual_anchor,
    requirements.visual_fidelity_anchor,
    subjectLock.visual_description,
    subjectLock.generator_visual_anchor,
    continuityBible.subject_visual_anchor,
    requirements.world_visual_anchor,
    continuityBible.world_visual_anchor,
  ]) pushUnique(target, value);
  return target;
}

function beatPhrases(input = {}, target = []) {
  const beat = object(input.requirements?.cinematic_story_beat);
  const hidden = object(beat.hidden_direction);
  const camera = object(hidden.camera);
  const lighting = object(hidden.lighting);
  for (const value of [
    beat.frame_intent,
    hidden.narrative_action,
    hidden.opening_frame,
    hidden.closing_frame,
    camera.framing,
    camera.angle,
    camera.lens_intent,
    camera.movement_path,
    camera.movement_speed,
    camera.focus_target,
    lighting.source,
    lighting.direction,
    lighting.colour,
    lighting.contrast,
  ]) pushUnique(target, value);
  return target;
}

function assertCleanPrompt(prompt) {
  const lower = prompt.toLowerCase();
  if (!prompt) throw new Error("AVANTIQO_VIDEO_FAST_PREVIEW_CLEAN_PROMPT_REQUIRED");
  if (BLOCKED_MARKERS.some((marker) => lower.includes(marker))) {
    throw new Error("AVANTIQO_VIDEO_FAST_PREVIEW_PROMPT_METADATA_LEAK_BLOCKED");
  }
  if (/[{}\[\]]/.test(prompt) || /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/i.test(prompt)) {
    throw new Error("AVANTIQO_VIDEO_FAST_PREVIEW_PROMPT_STRUCTURE_LEAK_BLOCKED");
  }
  return prompt;
}

export function compileAvantiqoVideoFastPreviewPrompt(input = {}) {
  const phrases = [];
  visualAnchorPhrases(input, phrases);
  let visualRepairFound = false;
  for (const row of repairRows(input)) {
    const before = phrases.length;
    const consumed = parseStructuredValues(row, phrases);
    if (consumed && phrases.length > before) visualRepairFound = true;
  }
  if (!visualRepairFound) beatPhrases(input, phrases);
  const prompt = phrases.slice(0, 14).join(". ").slice(0, 2200).replace(/[. ]+$/, "") + ".";
  return assertCleanPrompt(prompt);
}
