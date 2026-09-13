import { createHash } from "node:crypto";

const CONTRACT = "AVANTIQO_MUSIC_CHANGE_SET_V1";
const SECTION_ALIASES = Object.freeze({
  intro: ["intro", "introduction"],
  verse: ["verse"],
  prechorus: ["pre-chorus", "prechorus", "pre chorus"],
  chorus: ["chorus"],
  bridge: ["bridge"],
  hook: ["hook"],
  drop: ["drop"],
  breakdown: ["breakdown"],
  outro: ["outro", "ending"],
});
const ORDINALS = Object.freeze({
  first: 0, 1: 0,
  second: 1, 2: 1,
  third: 2, 3: 2,
  fourth: 3, 4: 3,
});

function text(value, max = 900) {
  return String(value ?? "").trim().slice(0, max);
}
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function hash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex").slice(0, 32);
}
function normalizeRange(value = {}) {
  const start = finite(value.start_seconds ?? value.start);
  const end = finite(value.end_seconds ?? value.end);
  if (start === null || end === null || start < 0 || end <= start) return null;
  return {
    start_seconds: start,
    end_seconds: end,
    label: text(value.label, 180) || null,
  };
}
function overlaps(a, b) {
  return a.start_seconds < b.end_seconds && b.start_seconds < a.end_seconds;
}
function sectionKey(value) {
  const lower = text(value, 240).toLowerCase();
  for (const [key, aliases] of Object.entries(SECTION_ALIASES)) {
    if (aliases.some((alias) => lower.includes(alias))) return key;
  }
  return null;
}
function requestedOrdinal(value) {
  const lower = text(value, 240).toLowerCase();
  const words = lower.split(/[^a-z0-9]+/).filter(Boolean);
  for (const word of words) {
    if (Object.hasOwn(ORDINALS, word)) return ORDINALS[word];
    const numeric = word.match(/^(\d)(?:st|nd|rd|th)$/);
    if (numeric && Object.hasOwn(ORDINALS, numeric[1])) return ORDINALS[numeric[1]];
  }
  return null;
}

export function resolveMusicChangeTarget({
  instruction,
  target_range,
  conversation_context = {},
} = {}) {
  const explicit = normalizeRange(target_range);
  if (explicit) {
    return {
      status: "EXPLICIT",
      target_range: explicit,
      section: sectionKey(explicit.label),
      candidates: [explicit],
    };
  }
  const requestedSection = sectionKey(instruction);
  if (!requestedSection) {
    return { status: "SECTION_NOT_REQUESTED", target_range: null, section: null, candidates: [] };
  }
  const source = [
    ...list(conversation_context.approved_sections),
    ...list(conversation_context.protected_ranges),
  ];
  const seen = new Set();
  const candidates = source
    .map(normalizeRange)
    .filter(Boolean)
    .filter((row) => {
      if (sectionKey(row.label) !== requestedSection) return false;
      const key = `${row.start_seconds}:${row.end_seconds}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.start_seconds - b.start_seconds);
  if (!candidates.length) {
    return { status: "SECTION_RANGE_UNKNOWN", target_range: null, section: requestedSection, candidates: [] };
  }
  if (candidates.length === 1) {
    return { status: "RESOLVED", target_range: candidates[0], section: requestedSection, candidates };
  }
  const ordinal = requestedOrdinal(instruction);
  if (ordinal !== null && candidates[ordinal]) {
    return { status: "RESOLVED_ORDINAL", target_range: candidates[ordinal], section: requestedSection, candidates };
  }
  return { status: "SECTION_RANGE_AMBIGUOUS", target_range: null, section: requestedSection, candidates };
}

export function buildMusicChangeSet({
  creative_project_id,
  master_asset_id,
  instruction,
  target_range,
  intended_delta,
  conversation_context = {},
  allow_protected_overlap = false,
} = {}) {
  const targetResolution = resolveMusicChangeTarget({ instruction, target_range, conversation_context });
  const target = targetResolution.target_range;
  const protectedRanges = list(conversation_context.protected_ranges).map(normalizeRange).filter(Boolean);
  const conflicts = target ? protectedRanges.filter((row) => overlaps(target, row)) : [];
  const blockers = [];
  if (!text(creative_project_id)) blockers.push("CREATIVE_PROJECT_REQUIRED");
  if (!text(master_asset_id)) blockers.push("MASTER_ASSET_REQUIRED");
  if (!target) {
    if (targetResolution.status === "SECTION_RANGE_AMBIGUOUS") blockers.push("SECTION_RANGE_AMBIGUOUS");
    else if (targetResolution.status === "SECTION_RANGE_UNKNOWN") blockers.push("SECTION_RANGE_UNKNOWN");
    else blockers.push("EXACT_TARGET_RANGE_REQUIRED");
  }
  if (!text(intended_delta || instruction)) blockers.push("INTENDED_DELTA_REQUIRED");
  if (conflicts.length && allow_protected_overlap !== true) blockers.push("PROTECTED_RANGE_CONFLICT");
  const core = {
    contract: CONTRACT,
    creative_project_id: text(creative_project_id),
    master_asset_id: text(master_asset_id),
    instruction: text(instruction, 1200) || null,
    intended_delta: text(intended_delta || instruction, 1200) || null,
    target_range: target,
    target_resolution: targetResolution,
    protected_ranges: protectedRanges,
    protected_conflicts: conflicts,
    preserve_outside_target: true,
    allow_protected_overlap: allow_protected_overlap === true,
    blockers,
  };
  return {
    ...core,
    change_set_fingerprint: hash(core),
    execution_ready: blockers.length === 0,
    requires_explicit_override: conflicts.length > 0,
    publication_authorized: false,
  };
}

export const CreativeMusicChangeSetRuntime = Object.freeze({
  contract: CONTRACT,
  build: buildMusicChangeSet,
  resolveTarget: resolveMusicChangeTarget,
});
