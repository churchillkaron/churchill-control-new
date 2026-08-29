const COMMAND_MAX_CHARS = 1200;
const COMMAND_MAX_WORDS = 180;
const WAKE_MAX_CHARS = 360;
const WAKE_MAX_WORDS = 40;

const INTERNAL_PROMPT_MARKERS = Object.freeze([
  "this is a spoken command to the avantiqo business operating system",
  "preserve navigation phrases such as open go to take me to show me and navigate to",
  "registered avantiqo destinations",
  "this is wake word detection for the assistant avantiqo",
  "avantiqo is spelled a v a n t i q o",
  "listen especially for pronunciations or transcriptions resembling avantiqo",
  "preserve any words spoken immediately after it",
]);

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(value) {
  const source = normalized(value);
  return source ? source.split(" ").length : 0;
}

function modeName(value) {
  return text(value).toLowerCase() === "wake" ? "wake" : "command";
}

export function inspectOperatorVoiceTranscript(value, { mode = "command" } = {}) {
  const transcript = text(value);
  const normalizedTranscript = normalized(transcript);
  const resolvedMode = modeName(mode);

  if (!transcript) {
    return {
      safe: resolvedMode === "wake",
      transcript: "",
      mode: resolvedMode,
      reason: resolvedMode === "wake" ? null : "AVANTIQO_VOICE_TRANSCRIPT_EMPTY",
    };
  }

  const promptMarker = INTERNAL_PROMPT_MARKERS.find((marker) =>
    normalizedTranscript.includes(marker),
  );
  if (promptMarker) {
    return {
      safe: false,
      transcript: "",
      mode: resolvedMode,
      reason: "AVANTIQO_VOICE_INTERNAL_PROMPT_ECHO_REJECTED",
    };
  }

  const words = wordCount(transcript);
  const maxChars = resolvedMode === "wake" ? WAKE_MAX_CHARS : COMMAND_MAX_CHARS;
  const maxWords = resolvedMode === "wake" ? WAKE_MAX_WORDS : COMMAND_MAX_WORDS;
  if (transcript.length > maxChars || words > maxWords) {
    return {
      safe: false,
      transcript: "",
      mode: resolvedMode,
      reason: "AVANTIQO_VOICE_TRANSCRIPT_IMPLAUSIBLY_LONG",
    };
  }

  return {
    safe: true,
    transcript,
    mode: resolvedMode,
    reason: null,
  };
}

export function safeOperatorVoiceTranscript(value, options = {}) {
  return inspectOperatorVoiceTranscript(value, options).transcript;
}

export const OPERATOR_VOICE_TRANSCRIPT_SAFETY = Object.freeze({
  contract: "AVANTIQO_OPERATOR_VOICE_TRANSCRIPT_SAFETY_V1",
  command_max_chars: COMMAND_MAX_CHARS,
  command_max_words: COMMAND_MAX_WORDS,
  wake_max_chars: WAKE_MAX_CHARS,
  wake_max_words: WAKE_MAX_WORDS,
  internal_prompt_echo_allowed: false,
  raw_prompt_returned: false,
});
