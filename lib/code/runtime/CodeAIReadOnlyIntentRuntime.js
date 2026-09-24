export const CODE_AI_READ_ONLY_INTENT_CONTRACT = "AVANTIQO_CODE_AI_READ_ONLY_INTENT_V1";

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

export function isCodeAIExplicitReadOnlyIntent(...values) {
  const intent = values
    .map((value) => text(value).toLowerCase())
    .filter(Boolean)
    .join("\n");
  if (!intent) return false;
  return /\bread[- ]?only\b|\bmake no (?:source )?changes\b|\bno source changes\b|\bwithout (?:source )?changes\b|\b(?:do not|don't) modify (?:the )?(?:source|repository|code|files?|anything)\b/.test(intent);
}

export function extractCodeAIExplicitRepositoryPaths(value, maximum = 12) {
  const input = text(value);
  const matches = input.match(/\b(?:app|components|lib|tests|scripts|supabase)\/[A-Za-z0-9_@+./()[\]-]+\.(?:js|jsx|mjs|cjs|ts|tsx|json|sql|md|py|ps1)\b/g) || [];
  return [...new Set(matches.map((item) => item.replace(/[),.;:]+$/g, "")))]
    .slice(0, Math.max(1, Math.min(24, Number(maximum) || 12)));
}

export default Object.freeze({
  contract: CODE_AI_READ_ONLY_INTENT_CONTRACT,
  isExplicit: isCodeAIExplicitReadOnlyIntent,
  extractPaths: extractCodeAIExplicitRepositoryPaths,
});
