const CONTRACT = "AVANTIQO_MUSIC_DECISION_INTERPRETER_V1";
const SECTION_WORDS = ["intro", "verse", "pre-chorus", "prechorus", "chorus", "bridge", "outro", "hook", "drop", "breakdown"];

function text(value, max = 900) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}
function compact(value, max = 220) { return text(value, max).replace(/[.!?]+$/g, ""); }

function parseTimestamp(value) {
  const parts = String(value || "").split(":").map(Number);
  if (!parts.length || parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function extractRange(statement) {
  const match = statement.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:-|–|—|to)\s*(\d{1,2}:\d{2}(?::\d{2})?)\b/i);
  if (!match) return null;
  const start = parseTimestamp(match[1]);
  const end = parseTimestamp(match[2]);
  if (start === null || end === null || end <= start) return null;
  return { start_seconds: start, end_seconds: end };
}
function sectionFrom(statement) {
  const lower = statement.toLowerCase();
  return SECTION_WORDS.find((section) => lower.includes(section)) || null;
}

function rejectedIdea(statement) {
  const match = statement.match(/(?:don['’]?t use|do not use|avoid|no more|reject)\s+(.+?)(?:[.!?]|$)/i);
  return match ? compact(match[1], 240) : null;
}

function unresolvedDecision(statement) {
  const match = statement.match(/(?:still need to decide|need to decide|not sure about|undecided(?: about)?|haven['’]?t decided)\s+(.+?)(?:[.!?]|$)/i);
  return match ? compact(match[1], 240) : null;
}

function keepTarget(statement) {
  const match = statement.match(/(?:keep|preserve|leave|don['’]?t change|do not change)\s+(.+?)(?:[.!?]|$)/i);
  return match ? compact(match[1], 240) : null;
}
function decisionSummary(input = {}) {
  const { range, section, keep, rejected, unresolved } = input;
  if (range && keep) return `Protect ${range.start_seconds}-${range.end_seconds}s: ${section || keep}`;
  if (rejected) return `Reject: ${rejected}`;
  if (unresolved) return `Unresolved: ${unresolved}`;
  if (keep) return `Keep: ${section || keep}`;
  return null;
}
export function interpretMusicProjectDecision(statementInput) {
  const statement = text(statementInput);
  const patch = {};
  if (!statement) return { contract: CONTRACT, recognized: false, patch, decision_summary: null };
  const range = extractRange(statement);
  const section = sectionFrom(statement);
  const rejected = rejectedIdea(statement);
  const unresolved = unresolvedDecision(statement);
  const keep = keepTarget(statement);
  if (rejected) patch.rejected_ideas = [rejected];
  if (unresolved) patch.unresolved_decisions = [unresolved];
  if (keep) patch.approved_decisions = [section ? `Keep ${section}` : `Keep ${keep}`];
  if (range && keep) {
    const row = { ...range, label: section || keep, reason: "Approved in Business Partner conversation" };
    patch.approved_sections = [row];
    patch.protected_ranges = [row];
  }
  const recognized = Object.keys(patch).length > 0;
  return {
    contract: CONTRACT,
    recognized,
    patch,
    decision_summary: recognized ? decisionSummary({ range, section, keep, rejected, unresolved }) : null,
    raw_statement_persisted: false,
  };
}

export const CreativeMusicDecisionInterpreterRuntime = Object.freeze({
  contract: CONTRACT,
  interpret: interpretMusicProjectDecision,
});
