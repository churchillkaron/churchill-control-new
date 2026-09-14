export const DETERMINISTIC_ACTION_ROUTING_CONTRACT = "AVANTIQO_OPERATOR_DETERMINISTIC_ACTION_ROUTING_V1";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalized(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function actionMode(capability = {}) {
  return normalized(capability.mode);
}

function commandPhrase(message) {
  return normalized(message).replace(
    /^(?:please\s+)?(?:kindly\s+|go ahead and\s+|can you\s+|could you\s+|would you\s+|will you\s+|i want you to\s+|i need you to\s+)?/,
    "",
  );
}

function aliasMatch(message, alias) {
  const query = commandPhrase(message);
  const candidate = normalized(alias);
  if (!query || !candidate || candidate.length < 3) return false;
  return query === candidate || query.startsWith(`${candidate} `);
}

export function resolveDeterministicGovernedAction({ message, capabilities = [] } = {}) {
  const matches = [];
  for (const capability of list(capabilities)) {
    if (["read", "navigate"].includes(actionMode(capability))) continue;
    const key = text(capability?.key, 300);
    if (!key) continue;
    for (const alias of list(capability?.operator_aliases)) {
      if (!aliasMatch(message, alias)) continue;
      matches.push({ capability, alias: text(alias, 500), alias_length: normalized(alias).length });
    }
  }
  if (!matches.length) return null;

  const longest = Math.max(...matches.map((item) => item.alias_length));
  const strongest = matches.filter((item) => item.alias_length === longest);
  const keys = [...new Set(strongest.map((item) => text(item.capability?.key, 300)).filter(Boolean))];
  if (keys.length !== 1) return null;

  const winner = strongest.find((item) => text(item.capability?.key, 300) === keys[0]);
  return {
    contract: DETERMINISTIC_ACTION_ROUTING_CONTRACT,
    capability_key: keys[0],
    matched_alias: winner?.alias || null,
    route: "governed",
    requires_mutation: true,
    needs_current_evidence: false,
    authorization_effect: "NONE",
  };
}

export default resolveDeterministicGovernedAction;
