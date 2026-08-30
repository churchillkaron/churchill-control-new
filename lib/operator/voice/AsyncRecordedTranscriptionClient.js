const DEFAULT_POLL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 60 * 1000;
const EXPLICIT_VOICE_INTENT = "explicit-user-voice-v1";
const VOICE_CAPTURE_INTENT_KEY = "__avantiqo_voice_capture_intent_v2";
const VOICE_REPLY_INTENT_KEY = "__avantiqo_voice_reply_intent_v2";
const VOICE_INTENT_LISTENER_KEY = "__avantiqo_voice_intent_listener_v2";
const VOICE_INTENT_TTL_MS = 120 * 1000;

function text(value) {
  return String(value ?? "").trim();
}

function normalize(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function explicitVoiceControl(button) {
  if (!button) return false;
  const label = normalize(`${button.getAttribute?.("aria-label") || ""} ${button.textContent || ""}`);
  if (!label) return false;
  return (
    label.includes("talk to avantiqo") ||
    label === "talk" ||
    label.startsWith("talk ") ||
    label.includes("say avantiqo") ||
    label.includes("say avantiq") ||
    label.includes("enable hey avantiqo")
  );
}

function installExplicitVoiceGestureCapture() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window[VOICE_INTENT_LISTENER_KEY]) return;
  window[VOICE_INTENT_LISTENER_KEY] = true;
  document.addEventListener(
    "click",
    (event) => {
      const button = event?.target?.closest?.("button");
      if (!explicitVoiceControl(button)) return;
      window[VOICE_CAPTURE_INTENT_KEY] = {
        expiresAt: Date.now() + VOICE_INTENT_TTL_MS,
        remaining: 1,
      };
      delete window[VOICE_REPLY_INTENT_KEY];
    },
    true,
  );
}

function consumeCaptureIntent(explicit = false) {
  if (explicit === true) return true;
  if (typeof window === "undefined") return false;
  const intent = window[VOICE_CAPTURE_INTENT_KEY];
  if (!intent || Number(intent.expiresAt || 0) < Date.now() || Number(intent.remaining || 0) < 1) {
    delete window[VOICE_CAPTURE_INTENT_KEY];
    return false;
  }
  delete window[VOICE_CAPTURE_INTENT_KEY];
  return true;
}

function grantReplyIntent() {
  if (typeof window === "undefined") return;
  window[VOICE_REPLY_INTENT_KEY] = {
    expiresAt: Date.now() + VOICE_INTENT_TTL_MS,
    remaining: 1,
  };
}

function abortError(message = "Voice transcription cancelled") {
  if (typeof DOMException !== "undefined") {
    return new DOMException(message, "AbortError");
  }
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function mergedSignal(signal, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    release() {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    },
  };
}

async function fetchBounded(url, options = {}, signal = null) {
  const bound = mergedSignal(signal);
  try {
    return await fetch(url, { ...options, signal: bound.signal });
  } finally {
    bound.release();
  }
}

function wait(ms, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function cancelExactTranscriptionJob({ organizationId, jobId }) {
  const organization = text(organizationId);
  const job = text(jobId);
  if (!organization || !job) return false;
  const params = new URLSearchParams({ organizationId: organization, jobId: job });
  try {
    await fetch(`/api/operator/transcribe?${params.toString()}`, {
      method: "DELETE",
      credentials: "same-origin",
      cache: "no-store",
      keepalive: true,
    });
    return true;
  } catch {
    return false;
  }
}

function completedResult(result, mode = "command") {
  const transcript = text(result?.transcript);
  if (!transcript && mode !== "wake") {
    throw new Error(result?.error || "Voice transcription returned no text");
  }
  return {
    ...result,
    success: true,
    pending: false,
    transcript,
    ...(mode === "wake" && !transcript ? { wake_detected: false } : {}),
  };
}

installExplicitVoiceGestureCapture();

export async function transcribeRecordedAudio({
  audio,
  organizationId,
  entityId = null,
  locale = null,
  mode = "command",
  speechLanguage = null,
  signal = null,
  pollMs = DEFAULT_POLL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  userInitiatedVoice = false,
} = {}) {
  const organization = text(organizationId);
  if (!audio?.size || !organization) throw new Error("Voice transcription context unavailable");
  if (!consumeCaptureIntent(userInitiatedVoice)) throw new Error("Explicit Voice action required");

  const normalizedMode = text(mode).toLowerCase() === "wake" ? "wake" : "command";
  const startedAt = Date.now();
  let jobId = null;
  let terminal = false;

  try {
    if (signal?.aborted) throw abortError();
    const form = new FormData();
    form.append("audio", audio, audio.name || (audio.type?.includes("mp4") ? "avantiqo-voice.m4a" : "avantiqo-voice.webm"));
    form.append("organizationId", organization);
    if (text(entityId)) form.append("entityId", text(entityId));
    if (text(locale)) form.append("locale", text(locale));
    form.append("mode", normalizedMode);
    form.append("voiceIntent", EXPLICIT_VOICE_INTENT);
    if (text(speechLanguage)) form.append("speechLanguage", text(speechLanguage));

    let response = await fetchBounded("/api/operator/transcribe", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "X-Avantiqo-Voice-Intent": EXPLICIT_VOICE_INTENT },
      body: form,
    }, signal);
    let result = await response.json().catch(() => ({}));

    if (response.ok && response.status !== 202 && result?.pending !== true) {
      terminal = true;
      const completed = completedResult(result, normalizedMode);
      if (normalizedMode === "command" && completed.transcript) grantReplyIntent();
      return completed;
    }
    if (response.status !== 202 || result?.success === false || !text(result?.job_id)) {
      terminal = true;
      throw new Error(result?.error || "Voice transcription could not start");
    }

    jobId = text(result.job_id);
    while (Date.now() - startedAt < timeoutMs) {
      await wait(Math.max(250, Number(pollMs) || DEFAULT_POLL_MS), signal);
      const params = new URLSearchParams({ organizationId: organization, jobId, mode: normalizedMode });
      if (text(locale)) params.set("locale", text(locale));
      if (text(speechLanguage)) params.set("speechLanguage", text(speechLanguage));

      response = await fetchBounded(`/api/operator/transcribe?${params.toString()}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      }, signal);
      result = await response.json().catch(() => ({}));

      if (response.status === 202 && result?.pending === true) continue;
      terminal = true;
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || "Voice transcription failed");
      }
      const completed = completedResult(result, normalizedMode);
      if (normalizedMode === "command" && completed.transcript) grantReplyIntent();
      return completed;
    }

    throw new Error("Voice transcription timed out");
  } finally {
    if (jobId && !terminal) {
      await cancelExactTranscriptionJob({ organizationId: organization, jobId });
    }
  }
}

export { cancelExactTranscriptionJob };
