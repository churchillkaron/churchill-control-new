export const CODE_AI_OWNER_VERIFICATION_COMMAND_CONTRACT =
  "AVANTIQO_CODE_AI_OWNER_VERIFICATION_COMMAND_V1";

const ALLOWED_COMMANDS = new Set([
  "node", "npm", "npx", "pnpm", "yarn", "bun",
  "python", "python3", "pytest",
  "go", "cargo", "make", "cmake",
]);

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function stripWrapper(value) {
  const source = text(value, 3000).replace(/\.\s*$/, "").trim();
  const first = source[0];
  const last = source[source.length - 1];
  if (
    source.length >= 2 &&
    ((first === "`" && last === "`") ||
      (first === "\"" && last === "\"") ||
      (first === "'" && last === "'"))
  ) {
    return source.slice(1, -1).trim();
  }
  return source;
}
function safeTokens(value) {
  const source = stripWrapper(value);
  if (!source || source.includes("&&") || source.includes("||") || source.includes("$(")) return [];
  if (/[;|<>]/.test(source)) return [];
  const tokens = [];
  const matcher = /"([^"]*)"|'([^']*)'|([^\s]+)/g;
  let match;
  while ((match = matcher.exec(source))) {
    tokens.push(text(match[1] ?? match[2] ?? match[3], 1000));
    if (tokens.length > 32) return [];
  }
  return tokens.filter(Boolean);
}
function normalizeCandidate(value, source) {
  const tokens = safeTokens(value);
  if (tokens.length < 2) return null;
  const command = text(tokens[0], 80).toLowerCase();
  if (!ALLOWED_COMMANDS.has(command)) return null;
  return {
    contract: CODE_AI_OWNER_VERIFICATION_COMMAND_CONTRACT,
    command,
    args: tokens.slice(1),
    source,
    shell_interpretation_allowed: false,
    authorization_effect: "NONE",
  };
}

export function parseCodeAIOwnerVerificationCommand(objective = "") {
  const source = text(objective, 12000);
  if (!source) return null;
  if (source.includes("&&") || source.includes("||") || source.includes("$(") || /[;|<>]/.test(source)) {
    return null;
  }

  const markerPatterns = [
    {
      source: "AUTHORITATIVE_OBJECTIVE_TEXT",
      regex: /\bauthoritative\s+verification\s+command\s+is\s*:?\s*([^\n;]+?)(?=\s+(?:only\s+these|use\s+the\s+source|apply\s+coherent|do\s+not\s+(?:push|deploy))\b|[\n;]|$)/i,
    },
    {
      source: "NATURAL_OWNER_VERIFICATION_COMMAND",
      regex: /\b(?:run|execute)\s+((?:node|npm|npx|pnpm|yarn|bun|python3?|pytest|go|cargo|make|cmake)\s+[^\n;]+?)(?=\s+(?:after|before|then)\b|\s+and\s+(?:inspect|review|check)\b|[\n;]|$)/i,
    },
    {
      source: "NATURAL_OWNER_VERIFICATION_COMMAND",
      regex: /\b(?:verify|check)\s+(?:with|using)\s+((?:node|npm|npx|pnpm|yarn|bun|python3?|pytest|go|cargo|make|cmake)\s+[^\n;]+?)(?=\s+(?:after|before|then)\b|[\n;]|$)/i,
    },
  ];

  for (const pattern of markerPatterns) {
    const match = source.match(pattern.regex);
    if (!match) continue;
    const normalized = normalizeCandidate(match[1], pattern.source);
    if (normalized) return normalized;
  }
  return null;
}

export function resolveCodeAIOwnerVerificationCommand({
  objective = "",
  objective_context = {},
} = {}) {
  const context = object(objective_context);
  const explicitCommand = text(context.authoritative_verification_command, 300);
  if (explicitCommand) {
    return {
      contract: CODE_AI_OWNER_VERIFICATION_COMMAND_CONTRACT,
      command: explicitCommand,
      args: list(context.authoritative_verification_args)
        .slice(0, 24)
        .map((item) => text(item, 1000))
        .filter(Boolean),
      source: "STRUCTURED_OBJECTIVE_CONTEXT",
      shell_interpretation_allowed: false,
      authorization_effect: "NONE",
    };
  }
  return parseCodeAIOwnerVerificationCommand(objective);
}

export default Object.freeze({
  contract: CODE_AI_OWNER_VERIFICATION_COMMAND_CONTRACT,
  parse: parseCodeAIOwnerVerificationCommand,
  resolve: resolveCodeAIOwnerVerificationCommand,
});
