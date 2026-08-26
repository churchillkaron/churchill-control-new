import { supabaseClient } from "@/lib/shared/supabase/client";

const CLIENT_CONTRACT = "AVANTIQO_VOICE_REALTIME_BROWSER_RELAY_CLIENT_V1";
const RELAY_CONTRACT = "AVANTIQO_VOICE_REALTIME_RELAY_V1";
const REALTIME_CONTRACT = "AVANTIQO_VOICE_STT_REALTIME_V1";
const CLIENT_PROTOCOL = "avantiqo-voice-realtime-v1";
const TARGET_SAMPLE_RATE = 16000;
const CONNECT_TIMEOUT_MS = 7000;
const READY_TIMEOUT_MS = 65_000;
const COMMIT_TIMEOUT_MS = 15_000;
const MAX_SESSION_MS = 90_000;

function text(value) {
  return String(value ?? "").trim();
}

function int16Base64(samples) {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function downsampleToPcm16(input, sourceRate) {
  if (!input?.length || !Number.isFinite(sourceRate) || sourceRate <= 0) {
    return null;
  }

  const ratio = sourceRate / TARGET_SAMPLE_RATE;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Int16Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.max(
      start + 1,
      Math.min(input.length, Math.floor((index + 1) * ratio)),
    );
    let sum = 0;
    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) {
      sum += input[sourceIndex];
    }
    const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return output;
}

function relayUrl({ organizationId, language = null }) {
  const base = text(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!base) throw new Error("AVANTIQO_VOICE_REALTIME_SUPABASE_URL_REQUIRED");
  const url = new URL(base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/functions/v1/avantiqo-voice-realtime-relay";
  url.search = "";
  url.hash = "";
  url.searchParams.set("organizationId", organizationId);
  if (language) url.searchParams.set("language", language);
  return url.toString();
}

async function currentAccessToken() {
  const { data, error } = await supabaseClient.auth.getSession();
  const token = text(data?.session?.access_token);
  if (error || !token) {
    throw new Error("AVANTIQO_VOICE_REALTIME_AUTH_REQUIRED");
  }
  return token;
}

export function ownedRealtimeRelayClientCertification() {
  return {
    contract: CLIENT_CONTRACT,
    implemented: true,
    wired_to_operator: false,
    realtime_streaming_certified: false,
    relay_required: true,
    worker_ready_required_before_audio: true,
    browser_runpod_access: false,
    browser_runpod_key_access: false,
    raw_audio_persisted: false,
  };
}

export async function startOwnedRealtimeRelayTranscription({
  organizationId,
  language = null,
  audioContext,
  stream,
  deferAudioCapture = false,
  onTranscript = null,
  onStatus = null,
  signal = null,
} = {}) {
  const resolvedOrganizationId = text(organizationId);
  if (!resolvedOrganizationId || !audioContext || !stream) {
    throw new Error("AVANTIQO_VOICE_REALTIME_BROWSER_INPUT_INVALID");
  }
  if (typeof WebSocket === "undefined") {
    throw new Error("AVANTIQO_VOICE_REALTIME_WEBSOCKET_UNAVAILABLE");
  }
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const token = await currentAccessToken();
  const websocket = new WebSocket(
    relayUrl({ organizationId: resolvedOrganizationId, language }),
    [CLIENT_PROTOCOL, `jwt.${token}`],
  );

  let sourceNode = null;
  let processorNode = null;
  let silentGain = null;
  let captureStarted = false;
  let workerReady = false;
  let closed = false;
  let committed = false;
  let finalTranscript = "";
  let readyResolve = null;
  let readyReject = null;
  let commitResolve = null;
  let commitReject = null;
  let readyTimer = null;
  let commitTimer = null;
  let sessionTimer = null;
  let abortHandler = null;

  const readyPromise = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  void readyPromise.catch(() => null);

  const commitPromise = new Promise((resolve, reject) => {
    commitResolve = resolve;
    commitReject = reject;
  });
  void commitPromise.catch(() => null);

  function publish(payload) {
    if (typeof onTranscript !== "function") return;
    try {
      onTranscript(payload);
    } catch {}
  }

  function publishStatus(payload) {
    if (typeof onStatus !== "function") return;
    try {
      onStatus(payload);
    } catch {}
  }

  function clearTimers() {
    if (readyTimer) window.clearTimeout(readyTimer);
    if (commitTimer) window.clearTimeout(commitTimer);
    if (sessionTimer) window.clearTimeout(sessionTimer);
    readyTimer = null;
    commitTimer = null;
    sessionTimer = null;
  }

  function cleanupAudio() {
    try { processorNode?.disconnect(); } catch {}
    try { sourceNode?.disconnect(); } catch {}
    try { silentGain?.disconnect(); } catch {}
    processorNode = null;
    sourceNode = null;
    silentGain = null;
    captureStarted = false;
  }

  function rejectReady(error) {
    readyReject?.(error);
    readyReject = null;
    readyResolve = null;
  }

  function rejectCommit(error) {
    commitReject?.(error);
    commitReject = null;
    commitResolve = null;
  }

  function closeSocket(code = 1000, reason = "complete") {
    if (closed) return;
    closed = true;
    if (!workerReady) {
      rejectReady(new Error("AVANTIQO_VOICE_REALTIME_WORKER_NOT_READY"));
    }
    clearTimers();
    cleanupAudio();
    if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
    try {
      if (websocket.readyState === WebSocket.OPEN) websocket.close(code, reason);
    } catch {}
  }

  async function cancel(reason = "AVANTIQO_VOICE_REALTIME_BROWSER_CANCELLED") {
    if (closed) return;
    if (websocket.readyState === WebSocket.OPEN) {
      try { websocket.send(JSON.stringify({ type: "session.cancel" })); } catch {}
    }
    const error = new Error(reason);
    if (!workerReady) rejectReady(error);
    rejectCommit(error);
    closeSocket(1000, "cancelled");
  }

  function startCapture() {
    if (closed || committed || !workerReady) return false;
    if (captureStarted) return true;
    if (websocket.readyState !== WebSocket.OPEN) return false;

    sourceNode = audioContext.createMediaStreamSource(stream);
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    silentGain = audioContext.createGain();
    silentGain.gain.value = 0;

    processorNode.onaudioprocess = (event) => {
      if (
        closed ||
        committed ||
        !workerReady ||
        websocket.readyState !== WebSocket.OPEN
      ) return;
      const input = event.inputBuffer.getChannelData(0);
      const pcm = downsampleToPcm16(input, audioContext.sampleRate);
      if (!pcm?.length) return;
      websocket.send(JSON.stringify({
        type: "audio.append",
        audio: int16Base64(pcm),
      }));
    };

    sourceNode.connect(processorNode);
    processorNode.connect(silentGain);
    silentGain.connect(audioContext.destination);
    captureStarted = true;
    publishStatus({ type: "capture.started", workerReady: true });
    return true;
  }

  await new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("AVANTIQO_VOICE_REALTIME_RELAY_CONNECT_TIMEOUT"));
    }, CONNECT_TIMEOUT_MS);

    websocket.addEventListener("open", () => {
      window.clearTimeout(timer);
      resolve();
    }, { once: true });

    websocket.addEventListener("error", () => {
      window.clearTimeout(timer);
      reject(new Error("AVANTIQO_VOICE_REALTIME_RELAY_CONNECT_FAILED"));
    }, { once: true });
  }).catch((error) => {
    try { websocket.close(); } catch {}
    throw error;
  });

  readyTimer = window.setTimeout(() => {
    const error = new Error("AVANTIQO_VOICE_REALTIME_WORKER_READY_TIMEOUT");
    rejectReady(error);
    rejectCommit(error);
    closeSocket(1000, "worker ready timeout");
  }, READY_TIMEOUT_MS);

  websocket.addEventListener("message", (event) => {
    if (closed || typeof event.data !== "string") return;
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      const error = new Error("AVANTIQO_VOICE_REALTIME_RELAY_EVENT_INVALID");
      if (!workerReady) rejectReady(error);
      rejectCommit(error);
      closeSocket(1011, "relay event invalid");
      return;
    }

    const type = text(payload?.type);

    if (type === "relay.connecting" || type === "relay.not_ready") {
      publishStatus({ type, workerReady: false });
      return;
    }

    if (type === "session.ready") {
      if (text(payload.contract) !== REALTIME_CONTRACT) {
        const error = new Error("AVANTIQO_VOICE_REALTIME_WORKER_CONTRACT_INVALID");
        rejectReady(error);
        rejectCommit(error);
        closeSocket(1011, "worker contract invalid");
        return;
      }
      if (workerReady) return;
      workerReady = true;
      if (readyTimer) window.clearTimeout(readyTimer);
      readyTimer = null;
      readyResolve?.(true);
      readyResolve = null;
      readyReject = null;
      publishStatus({ type: "session.ready", workerReady: true });
      if (!deferAudioCapture) startCapture();
      return;
    }

    if (type === "transcript.partial") {
      if (!workerReady || text(payload.contract) !== REALTIME_CONTRACT) return;
      publish({
        final: false,
        transcript: text(payload.transcript),
        stablePrefix: text(payload.stable_prefix),
        language: text(payload.language) || null,
      });
      return;
    }

    if (type === "transcript.final") {
      if (!workerReady || text(payload.contract) !== REALTIME_CONTRACT) {
        rejectCommit(new Error("AVANTIQO_VOICE_REALTIME_WORKER_CONTRACT_INVALID"));
        closeSocket(1011, "worker contract invalid");
        return;
      }
      finalTranscript = text(payload.transcript);
      if (!finalTranscript) {
        rejectCommit(new Error("AVANTIQO_VOICE_REALTIME_TRANSCRIPT_REQUIRED"));
        closeSocket(1011, "empty transcript");
        return;
      }
      publish({
        final: true,
        transcript: finalTranscript,
        stablePrefix: finalTranscript,
        language: text(payload.language) || null,
      });
      commitResolve?.(finalTranscript);
      commitResolve = null;
      commitReject = null;
      closeSocket(1000, "complete");
      return;
    }

    if (type === "relay.error" || type === "session.error") {
      const error = new Error(text(payload.code) || "AVANTIQO_VOICE_REALTIME_RELAY_FAILED");
      if (!workerReady) rejectReady(error);
      rejectCommit(error);
      closeSocket(1011, "relay failed");
    }
  });

  websocket.addEventListener("error", () => {
    const error = new Error("AVANTIQO_VOICE_REALTIME_RELAY_FAILED");
    if (!workerReady) rejectReady(error);
    rejectCommit(error);
    closeSocket(1011, "relay failed");
  });

  websocket.addEventListener("close", () => {
    if (!closed) {
      if (!workerReady) {
        rejectReady(new Error("AVANTIQO_VOICE_REALTIME_RELAY_CLOSED_BEFORE_READY"));
      }
      if (committed && !finalTranscript) {
        rejectCommit(new Error("AVANTIQO_VOICE_REALTIME_RELAY_CLOSED_EARLY"));
      }
    }
    closeSocket(1000, "closed");
  });

  if (signal) {
    abortHandler = () => {
      cancel("AVANTIQO_VOICE_REALTIME_BROWSER_ABORTED").catch(() => null);
    };
    signal.addEventListener("abort", abortHandler, { once: true });
  }

  sessionTimer = window.setTimeout(() => {
    cancel("AVANTIQO_VOICE_REALTIME_BROWSER_SESSION_TIMEOUT").catch(() => null);
  }, MAX_SESSION_MS);

  return {
    contract: CLIENT_CONTRACT,
    relayContract: RELAY_CONTRACT,

    async waitUntilReady() {
      await readyPromise;
      return true;
    },

    startCapture() {
      return startCapture();
    },

    async commit() {
      if (closed) throw new Error("AVANTIQO_VOICE_REALTIME_BROWSER_SESSION_CLOSED");
      await readyPromise;
      if (!committed) {
        committed = true;
        cleanupAudio();
        if (websocket.readyState !== WebSocket.OPEN) {
          await cancel("AVANTIQO_VOICE_REALTIME_RELAY_NOT_OPEN");
          throw new Error("AVANTIQO_VOICE_REALTIME_RELAY_NOT_OPEN");
        }
        websocket.send(JSON.stringify({ type: "audio.commit" }));
        commitTimer = window.setTimeout(() => {
          rejectCommit(new Error("AVANTIQO_VOICE_REALTIME_COMMIT_TIMEOUT"));
          closeSocket(1000, "commit timeout");
        }, COMMIT_TIMEOUT_MS);
      }
      return text(await commitPromise);
    },

    async cancel(reason) {
      await cancel(reason);
    },

    get ready() {
      return workerReady;
    },

    get capturing() {
      return captureStarted;
    },
  };
}
