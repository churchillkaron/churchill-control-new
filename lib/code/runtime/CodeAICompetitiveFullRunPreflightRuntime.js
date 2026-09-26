export const CODE_AI_COMPETITIVE_FULL_RUN_PREFLIGHT_CONTRACT =
  "AVANTIQO_CODE_COMPETITIVE_FULL_RUN_PREFLIGHT_V1";

const text = (value) => String(value ?? "").trim();

export function codeAICompetitiveProviderCredentialPresent(provider, env = process.env) {
  const key = text(provider).toLowerCase();
  if (key === "openai") return Boolean(text(env.OPENAI_API_KEY));
  if (key === "anthropic") return Boolean(text(env.ANTHROPIC_API_KEY));
  if (key === "google" || key === "gemini") {
    return Boolean(text(env.GEMINI_API_KEY || env.GOOGLE_API_KEY));
  }
  return false;
}

export function assessCodeAICompetitiveFullRunPreflight({
  providers = [],
  env = process.env,
  source_files = [],
  evidence_root_writable = false,
} = {}) {
  const canonicalProviders = [...new Set(
    providers.map((provider) => text(provider).toLowerCase() === "gemini" ? "google" : text(provider).toLowerCase()).filter(Boolean),
  )].sort();
  const credentials = Object.fromEntries(canonicalProviders.map((provider) => [
    provider,
    codeAICompetitiveProviderCredentialPresent(provider, env) ? "PRESENT" : "MISSING",
  ]));
  const missingProviderCredentials = canonicalProviders.filter((provider) => credentials[provider] !== "PRESENT");
  const missingSourceFiles = source_files
    .filter((entry) => entry?.exists !== true)
    .map((entry) => text(entry?.label || entry?.path))
    .filter(Boolean)
    .sort();
  const success =
    canonicalProviders.length > 0 &&
    missingProviderCredentials.length === 0 &&
    missingSourceFiles.length === 0 &&
    evidence_root_writable === true;

  return {
    success,
    contract: CODE_AI_COMPETITIVE_FULL_RUN_PREFLIGHT_CONTRACT,
    providers: canonicalProviders,
    credentials,
    missing_provider_credentials: missingProviderCredentials,
    source_file_count: source_files.length,
    missing_source_files: missingSourceFiles,
    evidence_root_writable: evidence_root_writable === true,
    credential_values_exposed: false,
    provider_calls_executed: false,
    provider_spend_performed: false,
    production_deploy_performed: false,
  };
}
