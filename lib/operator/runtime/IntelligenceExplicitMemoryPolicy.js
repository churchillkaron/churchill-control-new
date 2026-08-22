const MAX_MEMORY_CONTENT = 900;

function text(value, limit = MAX_MEMORY_CONTENT) {
  return String(value ?? "").trim().slice(0, limit);
}

function cleanClause(value) {
  return text(value)
    .replace(/^[\s,:;\-–—]+/, "")
    .replace(/[\s]+/g, " ")
    .replace(/[.!?]+$/, "")
    .trim();
}

function normalizedRevisionBasis(value) {
  return cleanClause(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(?:please\s+)?(?:do\s+not|don't|dont|not|no\s+longer|stop)\s+/i, "")
    .replace(/^(?:snalla\s+)?(?:inte|sluta)\s+/i, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f\s_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function durableContent(type, clause, marker) {
  const clean = cleanClause(clause);
  if (!clean) return "";

  if (type === "preference") {
    return marker.startsWith("sv_")
      ? `Jag föredrar: ${clean}.`
      : `I prefer: ${clean}.`;
  }

  if (["never", "want_never"].includes(marker)) return `Never ${clean}.`;
  if (["always", "want_always"].includes(marker)) return `Always ${clean}.`;
  if (marker === "sv_never") return `Aldrig ${clean}.`;
  if (marker === "sv_always") return `Alltid ${clean}.`;
  if (marker === "sv_from_now_on") return `Från och med nu: ${clean}.`;
  if (marker === "sv_going_forward") return `Framöver: ${clean}.`;
  if (marker === "going_forward") return `Going forward: ${clean}.`;
  return `From now on: ${clean}.`;
}

function candidate(type, clause, marker) {
  const clean = cleanClause(clause);
  if (clean.length < 4) return null;

  return {
    type,
    content: durableContent(type, clean, marker),
    marker,
    revision_basis: type === "constraint"
      ? normalizedRevisionBasis(clean)
      : null,
    scope: "party",
    importance: type === "constraint" ? 0.96 : 0.9,
    confidence: 1,
    authorization_value: "none",
  };
}

const RULES = [
  {
    type: "constraint",
    marker: "from_now_on",
    pattern: /\bfrom now on\b\s*[:,;-]?\s*(.+)$/i,
  },
  {
    type: "constraint",
    marker: "going_forward",
    pattern: /\bgoing forward\b\s*[:,;-]?\s*(.+)$/i,
  },
  {
    type: "constraint",
    marker: "always",
    pattern: /^(?:please\s+)?always\s+(.+)$/i,
  },
  {
    type: "constraint",
    marker: "never",
    pattern: /^(?:please\s+)?never\s+(.+)$/i,
  },
  {
    type: "constraint",
    marker: "want_always",
    pattern: /^(?:i want you to|you should|you must)\s+always\s+(.+)$/i,
  },
  {
    type: "constraint",
    marker: "want_never",
    pattern: /^(?:i want you to|you should|you must)\s+never\s+(.+)$/i,
  },
  {
    type: "preference",
    marker: "i_prefer",
    pattern: /\bi\s+(?:strongly\s+|really\s+)?prefer\s+(.+)$/i,
  },
  {
    type: "preference",
    marker: "my_preference",
    pattern: /\bmy preference is\s+(.+)$/i,
  },
  {
    type: "constraint",
    marker: "sv_from_now_on",
    pattern: /\bfrån och med nu\b\s*[:,;-]?\s*(.+)$/i,
  },
  {
    type: "constraint",
    marker: "sv_going_forward",
    pattern: /\bframöver\b\s*[:,;-]?\s*(.+)$/i,
  },
  {
    type: "constraint",
    marker: "sv_always",
    pattern: /^(?:snälla\s+)?alltid\s+(.+)$/i,
  },
  {
    type: "constraint",
    marker: "sv_never",
    pattern: /^(?:snälla\s+)?aldrig\s+(.+)$/i,
  },
  {
    type: "preference",
    marker: "sv_prefer",
    pattern: /\bjag föredrar\s+(.+)$/i,
  },
  {
    type: "preference",
    marker: "sv_preference",
    pattern: /\bmin preferens är\s+(.+)$/i,
  },
];

function splitStatements(message) {
  const source = text(message, 4000);
  if (!source) return [];

  const statements = source
    .split(/(?:\n+|(?<=[.!?])\s+)/)
    .map((item) => item.trim())
    .filter(Boolean);

  return statements.length ? statements.slice(0, 12) : [source];
}

function memoryIdentity(item) {
  return `${item.type}:${item.content.toLowerCase()}`;
}

export function extractExplicitDurableMemories(message) {
  const output = [];
  const seen = new Set();

  for (const statement of splitStatements(message)) {
    for (const rule of RULES) {
      const match = statement.match(rule.pattern);
      if (!match?.[1]) continue;

      const memory = candidate(rule.type, match[1], rule.marker);
      if (!memory) continue;

      const identity = memoryIdentity(memory);
      if (!seen.has(identity)) {
        seen.add(identity);
        output.push(memory);
      }
      break;
    }
  }

  return output.slice(0, 6);
}

export function hasExplicitDurableMemory(message) {
  return extractExplicitDurableMemories(message).length > 0;
}
