import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  OPERATOR_CERTIFIED_VOICE_LANGUAGES,
  requireOperatorVoiceLanguage,
  resolveOperatorVoiceLanguage,
} from "../lib/operator/runtime/OperatorVoiceLanguagePolicy.js";

function sorted(values) {
  return [...values].sort();
}

const ttsSource = await readFile("services/avantiqo-voice-tts/handler.py", "utf8");
const speakSource = await readFile("app/api/operator/speak/route.js", "utf8");
const supportedBlock = ttsSource.match(/SUPPORTED_LANGUAGES\s*=\s*\{([\s\S]*?)\}/)?.[1] || "";
const workerLanguages = Array.from(
  supportedBlock.matchAll(/["']([a-z]{2,3})["']/g),
  (match) => match[1],
);

assert.deepEqual(
  sorted(OPERATOR_CERTIFIED_VOICE_LANGUAGES),
  sorted(workerLanguages),
  "Operator voice policy must match the actual TTS worker language set",
);

const german = resolveOperatorVoiceLanguage({
  detectedLanguage: "de-DE",
  locale: "en-US",
});
assert.equal(german.language, "de");
assert.equal(german.reply_language, "de");
assert.equal(german.language_source, "detected");
assert.equal(german.voice_available, true);
assert.equal(german.voice_quality, "certified");
assert.equal(german.low_quality_fallback_allowed, false);

const english = requireOperatorVoiceLanguage({ locale: "en-US" });
assert.equal(english.language, "en");
assert.equal(english.voice_available, true);

const thai = resolveOperatorVoiceLanguage({
  detectedLanguage: "th-TH",
  locale: "en-US",
});
assert.equal(thai.language, "th");
assert.equal(thai.reply_language, "th");
assert.equal(thai.voice_available, false);
assert.equal(thai.voice_quality, "unavailable");
assert.equal(thai.low_quality_fallback_allowed, false);
assert.equal(thai.low_quality_fallback_used, false);
assert.equal(thai.error_code, "AVANTIQO_VOICE_TTS_LANGUAGE_NOT_CERTIFIED:th");
assert.throws(
  () => requireOperatorVoiceLanguage({ detectedLanguage: "th" }),
  (error) =>
    error?.status === 422 &&
    error?.code === "AVANTIQO_VOICE_TTS_LANGUAGE_NOT_CERTIFIED:th",
);

assert.match(speakSource, /requireOperatorVoiceLanguage/);
assert.match(speakSource, /detectedLanguage/);
assert.match(speakSource, /requestedLanguage/);
assert.match(speakSource, /locale: voiceLanguage\.language/);
assert.match(speakSource, /language: voiceLanguage\.language/);
assert.match(speakSource, /low_quality_fallback_allowed: false/);
assert.match(speakSource, /X-Avantiqo-Voice-Language/);
assert.match(speakSource, /X-Avantiqo-Voice-Quality/);

console.log("OPERATOR_VOICE_LANGUAGE_POLICY_AUDIT=PASS");
console.log(`OPERATOR_VOICE_CERTIFIED_LANGUAGE_COUNT=${workerLanguages.length}`);
console.log("OPERATOR_VOICE_THAI_REPLY_LANGUAGE=th");
console.log("OPERATOR_VOICE_THAI_SYNTHESIS=FAIL_CLOSED_UNTIL_CERTIFIED");
console.log("OPERATOR_VOICE_LOW_QUALITY_FALLBACK=false");
