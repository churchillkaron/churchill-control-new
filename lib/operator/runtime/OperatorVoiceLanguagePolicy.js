const CERTIFIED = [
  "ar", "da", "de", "el", "en", "es", "fi", "fr", "he", "hi", "it",
  "ja", "ko", "ms", "nl", "no", "pl", "pt", "ru", "sv", "sw", "tr", "zh",
];

export const OPERATOR_CERTIFIED_VOICE_LANGUAGES = Object.freeze([...CERTIFIED]);

const CERTIFIED_SET = new Set(OPERATOR_CERTIFIED_VOICE_LANGUAGES);

export function normalizeOperatorVoiceLanguage(value) {
  const raw = String(value ?? "").trim().toLowerCase().replaceAll("_", "-");
  if (!raw) return null;

  const code = raw.split("-")[0];
  return /^[a-z]{2,3}$/.test(code) ? code : null;
}

export function resolveOperatorVoiceLanguage({
  detectedLanguage = null,
  requestedLanguage = null,
  locale = null,
  defaultLanguage = "en",
} = {}) {
  const detected = normalizeOperatorVoiceLanguage(detectedLanguage);
  const requested = normalizeOperatorVoiceLanguage(requestedLanguage);
  const localized = normalizeOperatorVoiceLanguage(locale);
  const fallback = normalizeOperatorVoiceLanguage(defaultLanguage) || "en";
  const language = detected || requested || localized || fallback;
  const source = detected
    ? "detected"
    : requested
      ? "requested"
      : localized
        ? "locale"
        : "default";
  const voiceAvailable = CERTIFIED_SET.has(language);

  return {
    contract: "AVANTIQO_OPERATOR_VOICE_LANGUAGE_V1",
    language,
    reply_language: language,
    language_source: source,
    same_language_required: true,
    voice_available: voiceAvailable,
    voice_quality: voiceAvailable ? "certified" : "unavailable",
    low_quality_fallback_allowed: false,
    low_quality_fallback_used: false,
    error_code: voiceAvailable
      ? null
      : `AVANTIQO_VOICE_TTS_LANGUAGE_NOT_CERTIFIED:${language}`,
  };
}

export function requireOperatorVoiceLanguage(options = {}) {
  const plan = resolveOperatorVoiceLanguage(options);
  if (plan.voice_available) return plan;

  const error = new Error(plan.error_code);
  error.code = plan.error_code;
  error.status = 422;
  error.language = plan.language;
  error.voice_plan = plan;
  throw error;
}
