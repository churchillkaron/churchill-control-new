const CONTRACT = "AVANTIQO_MUSIC_SECTION_MAP_V1";

function text(value, max = 240) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function timeSeconds(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = text(value, 32);
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  const parts = raw.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function structuredSection(value = {}, cursor = 0) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const label = text(value.label || value.name || value.section || value.id, 180);
  const start = timeSeconds(value.start_seconds ?? value.start ?? value.from) ?? cursor;
  const explicitEnd = timeSeconds(value.end_seconds ?? value.end ?? value.to);
  const duration = finite(value.duration_seconds ?? value.duration);
  const end = explicitEnd ?? (duration !== null && duration > 0 ? start + duration : null);
  if (!label || start < 0 || end === null || end <= start) return null;
  return { start_seconds: start, end_seconds: end, label };
}
function stringSection(value) {
  const raw = text(value, 500);
  if (!raw) return null;
  const match = raw.match(/(\d{1,3}(?::\d{2})?(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d{1,3}(?::\d{2})?(?:\.\d+)?)\s*(.*)$/i);
  if (!match) return null;
  const start = timeSeconds(match[1]);
  const end = timeSeconds(match[2]);
  const label = text(match[3], 180).replace(/^[:\-–—\s]+/, "");
  if (start === null || end === null || end <= start || !label) return null;
  return { start_seconds: start, end_seconds: end, label };
}

export function deriveMusicSectionMap(preproduction = {}) {
  const source = list(preproduction.form_and_section_lengths || preproduction.sections || preproduction.form);
  const sections = [];
  let cursor = 0;
  for (const item of source) {
    const row = typeof item === "string"
      ? stringSection(item)
      : structuredSection(item, cursor);
    if (!row) continue;
    sections.push({
      ...row,
      source: "PREPRODUCTION_FORM",
      reason: "Locked Music pre-production section timing",
    });
    cursor = Math.max(cursor, row.end_seconds);
  }
  sections.sort((a, b) => a.start_seconds - b.start_seconds || a.end_seconds - b.end_seconds);
  return {
    contract: CONTRACT,
    sections,
    section_count: sections.length,
    exact_timing_available: sections.length > 0,
  };
}

export const CreativeMusicSectionMapRuntime = Object.freeze({
  contract: CONTRACT,
  derive: deriveMusicSectionMap,
});
