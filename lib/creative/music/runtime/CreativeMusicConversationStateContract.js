import { createHash } from "node:crypto";

export const MUSIC_CONVERSATION_STATE_CONTRACT = "AVANTIQO_MUSIC_CONVERSATION_STATE_V1";
export const MUSIC_CONVERSATION_STATE_METADATA_KEY = "music_conversation_state";
const MAX_ITEMS = 24;
const MAX_RECENT_DECISIONS = 12;

function text(value, max = 800) { return String(value ?? "").trim().slice(0, max); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function fingerprint(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24); }
function boundedUnique(values, max = MAX_ITEMS) {
  const seen = new Set();
  return list(values).map((item) => text(item)).filter((item) => item && !seen.has(item) && seen.add(item)).slice(-max);
}

function normalizeRange(value = {}) {
  const start = finite(value.start_seconds ?? value.start);
  const end = finite(value.end_seconds ?? value.end);
  if (start === null || end === null || start < 0 || end <= start) return null;
  return {
    id: text(value.id || fingerprint([start, end, value.label, value.reason]), 80),
    start_seconds: start,
    end_seconds: end,
    label: text(value.label, 180) || null,
    reason: text(value.reason, 500) || null,
    source: text(value.source, 80) || "BUSINESS_PARTNER",
  };
}

function ranges(value, max = MAX_ITEMS) {
  const seen = new Set();
  return list(value)
    .map(normalizeRange)
    .filter((item) => item && !seen.has(item.id) && seen.add(item.id))
    .slice(-max);
}

function normalizeVersion(value = {}) {
  if (typeof value === "string") return { id: text(value, 160), master_asset_id: null, parent_version_id: null, summary: null };
  if (!value || typeof value !== "object") return null;
  const id = text(value.id || value.version_id || value.master_asset_id, 160);
  if (!id) return null;
  return {
    id,
    master_asset_id: text(value.master_asset_id, 160) || null,
    parent_version_id: text(value.parent_version_id, 160) || null,
    summary: text(value.summary, 500) || null,
  };
}

function versions(value, max = MAX_ITEMS) {
  const seen = new Set();
  return list(value)
    .map(normalizeVersion)
    .filter((item) => item && !seen.has(item.id) && seen.add(item.id))
    .slice(-max);
}

export function emptyMusicConversationState() {
  return {
    contract: MUSIC_CONVERSATION_STATE_CONTRACT,
    creative_intent: null,
    sonic_identity: [],
    artist_preferences: [],
    approved_decisions: [],
    approved_sections: [],
    protected_ranges: [],
    rejected_ideas: [],
    unresolved_decisions: [],
    version_lineage: [],
    recent_decisions: [],
    revision: 0,
    updated_at: null,
  };
}

export function mergeMusicConversationState(current = {}, patch = {}) {
  const base = { ...emptyMusicConversationState(), ...(current || {}) };
  const next = {
    ...base,
    creative_intent: text(patch.creative_intent ?? base.creative_intent, 1200) || null,
    sonic_identity: boundedUnique([...(base.sonic_identity || []), ...(patch.sonic_identity || [])]),
    artist_preferences: boundedUnique([...(base.artist_preferences || []), ...(patch.artist_preferences || [])]),
    approved_decisions: boundedUnique([...(base.approved_decisions || []), ...(patch.approved_decisions || [])]),
    approved_sections: ranges([...(base.approved_sections || []), ...(patch.approved_sections || [])]),
    protected_ranges: ranges([...(base.protected_ranges || []), ...(patch.protected_ranges || [])]),
    rejected_ideas: boundedUnique([...(base.rejected_ideas || []), ...(patch.rejected_ideas || [])]),
    unresolved_decisions: boundedUnique([...(base.unresolved_decisions || []), ...(patch.unresolved_decisions || [])]),
    version_lineage: versions([...(base.version_lineage || []), ...(patch.version_lineage || [])]),
    recent_decisions: boundedUnique([...(base.recent_decisions || []), ...(patch.recent_decisions || [])], MAX_RECENT_DECISIONS),
    revision: Math.max(0, Number(base.revision || 0)) + 1,
    updated_at: new Date().toISOString(),
  };
  return { ...next, state_fingerprint: fingerprint(next) };
}

export function musicConversationExecutionContext(state = {}) {
  const source = { ...emptyMusicConversationState(), ...(state || {}) };
  return {
    contract: MUSIC_CONVERSATION_STATE_CONTRACT,
    creative_intent: source.creative_intent,
    approved_decisions: source.approved_decisions,
    protected_ranges: source.protected_ranges,
    approved_sections: source.approved_sections,
    rejected_ideas: source.rejected_ideas,
    unresolved_decisions: source.unresolved_decisions,
    sonic_identity: source.sonic_identity,
    artist_preferences: source.artist_preferences,
    version_lineage: source.version_lineage,
    state_fingerprint: source.state_fingerprint || fingerprint(source),
    raw_chat_transcript_saved: false,
  };
}
