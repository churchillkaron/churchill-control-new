import { createHash } from "node:crypto";

const CONTRACT = "AVANTIQO_MUSIC_CHANGE_SET_V1";
function text(value, max = 900) { return String(value ?? "").trim().slice(0, max); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function hash(value) { return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex").slice(0, 32); }
function normalizeRange(value = {}) {
  const start = finite(value.start_seconds ?? value.start);
  const end = finite(value.end_seconds ?? value.end);
  if (start === null || end === null || start < 0 || end <= start) return null;
  return { start_seconds: start, end_seconds: end, label: text(value.label, 180) || null };
}
function overlaps(a, b) {
  return a.start_seconds < b.end_seconds && b.start_seconds < a.end_seconds;
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
  const target = normalizeRange(target_range);
  const protectedRanges = list(conversation_context.protected_ranges).map(normalizeRange).filter(Boolean);
  const conflicts = target ? protectedRanges.filter((row) => overlaps(target, row)) : [];
  const blockers = [];
  if (!text(creative_project_id)) blockers.push("CREATIVE_PROJECT_REQUIRED");
  if (!text(master_asset_id)) blockers.push("MASTER_ASSET_REQUIRED");
  if (!target) blockers.push("EXACT_TARGET_RANGE_REQUIRED");
  if (!text(intended_delta || instruction)) blockers.push("INTENDED_DELTA_REQUIRED");
  if (conflicts.length && allow_protected_overlap !== true) blockers.push("PROTECTED_RANGE_CONFLICT");
  const core = {
    contract: CONTRACT,
    creative_project_id: text(creative_project_id),
    master_asset_id: text(master_asset_id),
    instruction: text(instruction, 1200) || null,
    intended_delta: text(intended_delta || instruction, 1200) || null,
    target_range: target,
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
});
