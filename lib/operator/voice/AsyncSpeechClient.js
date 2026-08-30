const DEFAULT_POLL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 60 * 1000;
const EXPLICIT_VOICE_INTENT = "explicit-user-voice-v2";

function text(value) {
  return String(value ?? "").trim();
}

function abortError(message = "Voice response cancelled") {
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

  if (signal?.aborted) {
    controller.abort();
  } else if (signal) {
    signal.addEventListener("abort", abort, { once: true });
  }

  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    release() {
      window.clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", abort);
    },
  };
}

async function fetchBounded(url, options = {}, signal = null) {
  const bound = mergedSignal(signal);
  try {
    return await fetch(url, {
      ...options,
      signal: bound.signal,
    });
  } finally {
    bound.release();
  }
}

function wait(ms, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function cancelExactSpeechJob({ organizationId, jobId }) {
  const organization = text(organizationId);
  const job = text(jobId);
  if (!organization || !job) return false;

  const params = new URLSearchParams({
    organizationId: organization,
    jobId: job,
  });

  try {
    await fetch(`/api/operator/speak/jobs?${params.toString()}`, {
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

export async function requestAsyncSpeechBlob({
  organizationId,
  entityId = null,
  message,
  locale = null,
  voiceLibraryProfileId = null,
  deliveryProfile = null,
  signal = null,
  pollMs = DEFAULT_POLL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  userInitiatedVoice = false,
} = {}) {
  const organization = text(organizationId);
  const spokenText = text(message);
  if (!organization || !spokenText) {
    throw new Error("Voice response context unavailable");
  }
  if (userInitiatedVoice !== true) {
    throw new Error("Explicit Voice action required");
  }

  const startedAt = Date.now();
  let jobId = null;
  let terminal = false;

  try {
    if (signal?.aborted) throw abortError();

    let response = await fetchBounded(
      "/api/operator/speak/jobs",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Avantiqo-Voice-Intent": EXPLICIT_VOICE_INTENT,
        },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          organizationId: organization,
          entityId: text(entityId) || null,
          text: spokenText,
          locale: text(locale) || null,
          voiceLibraryProfileId: text(voiceLibraryProfileId) || null,
          deliveryProfile: text(deliveryProfile) || null,
          voiceIntent: EXPLICIT_VOICE_INTENT,
        }),
      },
      signal,
    );

    if ((response.headers.get("content-type") || "").includes("audio/wav")) {
      terminal = true;
      const blob = await response.blob();
      if (!blob?.size) throw new Error("Voice response returned empty audio");
      return blob;
    }

    let result = await response.json().catch(() => ({}));
    if (response.status !== 202 || result?.success === false || !text(result?.job_id)) {
      terminal = true;
      throw new Error(result?.error || "Voice response could not start");
    }

    jobId = text(result.job_id);
    while (Date.now() - startedAt < timeoutMs) {
      await wait(Math.max(250, Number(pollMs) || DEFAULT_POLL_MS), signal);
      if (signal?.aborted) throw abortError();

      const params = new URLSearchParams({
        organizationId: organization,
        jobId,
      });
      response = await fetchBounded(
        `/api/operator/speak/jobs?${params.toString()}`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        },
        signal,
      );

      if ((response.headers.get("content-type") || "").includes("audio/wav")) {
        terminal = true;
        const blob = await response.blob();
        if (!blob?.size) throw new Error("Voice response returned empty audio");
        return blob;
      }

      result = await response.json().catch(() => ({}));
      if (response.status === 202 && result?.pending === true) continue;
      terminal = true;
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || "Voice response failed");
      }
      throw new Error("Voice response completed without audio");
    }

    throw new Error("Voice response timed out");
  } finally {
    if (jobId && !terminal) {
      await cancelExactSpeechJob({ organizationId: organization, jobId });
    }
  }
}
