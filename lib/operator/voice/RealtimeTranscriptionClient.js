const TARGET_SAMPLE_RATE = 24000;
const SESSION_TIMEOUT_MS = 7000;
const TRANSCRIPT_TIMEOUT_MS = 5000;

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
    const end = Math.max(start + 1, Math.min(input.length, Math.floor((index + 1) * ratio)));
    let sum = 0;
    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) {
      sum += input[sourceIndex];
    }
    const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return output;
}

async function postJson(url, body, timeoutMs = SESSION_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.success === false) {
      throw new Error(result?.error || `Request failed: ${response.status}`);
    }
    return result;
  } finally {
    window.clearTimeout(timer);
  }
}

async function settleSession({ organizationId, usageId, sessionId, action, reason = null }) {
  try {
    await postJson(
      "/api/operator/transcribe/realtime/settle",
      {
        organizationId,
        usageId,
        sessionId,
        action,
        ...(reason ? { reason } : {}),
      },
      SESSION_TIMEOUT_MS,
    );
  } catch (error) {
    console.warn("AVANTIQO_REALTIME_STT_SETTLEMENT_ERROR", error?.message || error);
  }
}

export async function startRealtimeTranscription({
  organizationId,
  entityId = null,
  locale = null,
  audioContext,
  stream,
} = {}) {
  if (!organizationId || !audioContext || !stream || typeof WebSocket === "undefined") {
    throw new Error("Realtime transcription unavailable");
  }

  const session = await postJson(
    "/api/operator/transcribe/realtime/session",
    {
      organizationId,
      entityId,
      locale: locale || navigator.language || "en-US",
    },
  );

  const clientSecret = text(session.client_secret);
  const sessionId = text(session.session_id);
  const usageId = text(session.usage_id);
  const websocketUrl = text(session.websocket_url);
  if (!clientSecret || !sessionId || !usageId || !websocketUrl) {
    throw new Error("Realtime transcription session incomplete");
  }

  let socket = null;
  let sourceNode = null;
  let processorNode = null;
  let silentGain = null;
  let closed = false;
  let committed = false;
  let completed = false;
  let finalTranscript = "";
  let transcriptResolve = null;
  let transcriptReject = null;
  let transcriptTimer = null;

  const transcriptPromise = new Promise((resolve, reject) => {
    transcriptResolve = resolve;
    transcriptReject = reject;
  });

  function clearTranscriptTimer() {
    if (!transcriptTimer) return;
    window.clearTimeout(transcriptTimer);
    transcriptTimer = null;
  }

  function cleanupAudio() {
    try { processorNode?.disconnect(); } catch {}
    try { sourceNode?.disconnect(); } catch {}
    try { silentGain?.disconnect(); } catch {}
    processorNode = null;
    sourceNode = null;
    silentGain = null;
  }

  function closeSocket() {
    if (!socket) return;
    try { socket.close(1000, "complete"); } catch {}
    socket = null;
  }

  async function cancel(reason = "REALTIME_TRANSCRIPTION_CANCELLED") {
    if (closed) return;
    closed = true;
    clearTranscriptTimer();
    cleanupAudio();
    closeSocket();
    transcriptReject?.(new Error(reason));
    transcriptReject = null;
    transcriptResolve = null;
    await settleSession({
      organizationId,
      usageId,
      sessionId,
      action: "cancel",
      reason,
    });
  }

  function handleServerEvent(event) {
    if (!event || typeof event !== "object") return;

    if (event.type === "conversation.item.input_audio_transcription.delta") {
      if (typeof event.delta === "string") finalTranscript += event.delta;
      return;
    }

    if (event.type === "conversation.item.input_audio_transcription.completed") {
      const transcript = text(event.transcript || finalTranscript);
      finalTranscript = transcript;
      completed = true;
      clearTranscriptTimer();
      transcriptResolve?.(transcript);
      transcriptResolve = null;
      transcriptReject = null;
      return;
    }

    if (event.type === "error") {
      const message = text(event.error?.message || event.message) || "Realtime transcription failed";
      clearTranscriptTimer();
      transcriptReject?.(new Error(message));
      transcriptResolve = null;
      transcriptReject = null;
    }
  }

  try {
    socket = new WebSocket(websocketUrl, [
      "realtime",
      `openai-insecure-api-key.${clientSecret}`,
    ]);

    await new Promise((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error("Realtime transcription connection timed out")),
        SESSION_TIMEOUT_MS,
      );
      socket.addEventListener("open", () => {
        window.clearTimeout(timer);
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        window.clearTimeout(timer);
        reject(new Error("Realtime transcription connection failed"));
      }, { once: true });
    });

    socket.addEventListener("message", (messageEvent) => {
      try {
        handleServerEvent(JSON.parse(String(messageEvent.data || "{}")));
      } catch {}
    });

    sourceNode = audioContext.createMediaStreamSource(stream);
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    silentGain = audioContext.createGain();
    silentGain.gain.value = 0;

    processorNode.onaudioprocess = (event) => {
      if (closed || committed || socket?.readyState !== WebSocket.OPEN) return;
      const input = event.inputBuffer.getChannelData(0);
      const pcm = downsampleToPcm16(input, audioContext.sampleRate);
      if (!pcm?.length) return;
      socket.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: int16Base64(pcm),
      }));
    };

    sourceNode.connect(processorNode);
    processorNode.connect(silentGain);
    silentGain.connect(audioContext.destination);
  } catch (error) {
    await cancel(error?.message || "REALTIME_TRANSCRIPTION_START_FAILED");
    throw error;
  }

  return {
    usageId,
    sessionId,

    async commit() {
      if (closed) throw new Error("Realtime transcription session closed");
      if (!committed) {
        committed = true;
        cleanupAudio();
        if (socket?.readyState !== WebSocket.OPEN) {
          await cancel("REALTIME_TRANSCRIPTION_SOCKET_CLOSED");
          throw new Error("Realtime transcription connection closed");
        }
        socket.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        transcriptTimer = window.setTimeout(() => {
          transcriptReject?.(new Error("Realtime transcription result timed out"));
          transcriptResolve = null;
          transcriptReject = null;
        }, TRANSCRIPT_TIMEOUT_MS);
      }

      try {
        const transcript = text(await transcriptPromise);
        if (!transcript) {
          await cancel("REALTIME_TRANSCRIPTION_EMPTY");
          return "";
        }
        if (!closed) {
          closed = true;
          clearTranscriptTimer();
          cleanupAudio();
          closeSocket();
          await settleSession({
            organizationId,
            usageId,
            sessionId,
            action: "complete",
          });
        }
        return transcript;
      } catch (error) {
        await cancel(error?.message || "REALTIME_TRANSCRIPTION_FAILED");
        throw error;
      }
    },

    async cancel(reason) {
      await cancel(reason);
    },

    get completed() {
      return completed;
    },
  };
}
