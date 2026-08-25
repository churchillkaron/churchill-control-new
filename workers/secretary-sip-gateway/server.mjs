import http from "node:http";
import net from "node:net";
import { randomUUID } from "node:crypto";

const env = process.env;
const HTTP_HOST = env.SECRETARY_GATEWAY_HTTP_HOST || "0.0.0.0";
const HTTP_PORT = Number(env.SECRETARY_GATEWAY_HTTP_PORT || 8787);
const AUDIO_HOST = env.SECRETARY_GATEWAY_AUDIO_HOST || "0.0.0.0";
const AUDIO_PORT = Number(env.SECRETARY_GATEWAY_AUDIO_PORT || 9019);
const GATEWAY_TOKEN = String(env.AVANTIQO_SECRETARY_SIP_GATEWAY_TOKEN || "").trim();
const AVANTIQO_BASE_URL = String(env.AVANTIQO_SECRETARY_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const INGRESS_TOKEN = String(env.AVANTIQO_SECRETARY_CALL_GATEWAY_TOKEN || "").trim();
const AMI_HOST = env.ASTERISK_AMI_HOST || "127.0.0.1";
const AMI_PORT = Number(env.ASTERISK_AMI_PORT || 5038);
const AMI_USERNAME = String(env.ASTERISK_AMI_USERNAME || "").trim();
const AMI_SECRET = String(env.ASTERISK_AMI_SECRET || "").trim();
const OUTBOUND_CONTEXT = env.ASTERISK_SECRETARY_OUTBOUND_CONTEXT || "avantiqo-secretary-outbound";
const OUTBOUND_EXTEN = env.ASTERISK_SECRETARY_OUTBOUND_EXTEN || "s";
const OUTBOUND_CHANNEL_TEMPLATE = env.ASTERISK_SECRETARY_OUTBOUND_CHANNEL_TEMPLATE || "PJSIP/{destination}@avantiqo-trunk";
const AUDIO_SERVICE = env.ASTERISK_SECRETARY_AUDIOSOCKET_SERVICE || `127.0.0.1:${AUDIO_PORT}`;
const VAD_THRESHOLD = Math.max(50, Number(env.SECRETARY_GATEWAY_VAD_THRESHOLD || 450));
const VAD_SILENCE_MS = Math.max(250, Number(env.SECRETARY_GATEWAY_VAD_SILENCE_MS || 650));
const VAD_MIN_SPEECH_MS = Math.max(100, Number(env.SECRETARY_GATEWAY_VAD_MIN_SPEECH_MS || 280));
const VAD_MAX_SPEECH_MS = Math.max(2000, Number(env.SECRETARY_GATEWAY_VAD_MAX_SPEECH_MS || 12000));

const sessionsByAudioUuid = new Map();
const sessionsByActionId = new Map();

function clean(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function safeHeader(value) {
  const result = clean(value, 4000);
  if (/\r|\n/.test(result)) throw new Error("ASTERISK_AMI_HEADER_INVALID");
  return result;
}

function requireRuntimeConfig() {
  const missing = [];
  if (!GATEWAY_TOKEN) missing.push("AVANTIQO_SECRETARY_SIP_GATEWAY_TOKEN");
  if (!AVANTIQO_BASE_URL) missing.push("AVANTIQO_SECRETARY_PUBLIC_BASE_URL");
  if (!INGRESS_TOKEN) missing.push("AVANTIQO_SECRETARY_CALL_GATEWAY_TOKEN");
  if (!AMI_USERNAME) missing.push("ASTERISK_AMI_USERNAME");
  if (!AMI_SECRET) missing.push("ASTERISK_AMI_SECRET");
  return missing;
}

function authorized(request) {
  return GATEWAY_TOKEN && request.headers.authorization === `Bearer ${GATEWAY_TOKEN}`;
}

function jsonResponse(response, status, body) {
  const encoded = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": encoded.length,
    "cache-control": "no-store",
  });
  response.end(encoded);
}

async function readJson(request, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function postJson(url, authorization, body, timeoutMs = 30000) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok || parsed?.success === false) {
    throw new Error(`AVANTIQO_API_REJECTED:${response.status}:${clean(parsed?.error || parsed?.message, 1000)}`);
  }
  return parsed;
}

function uuidBufferToString(buffer) {
  const hex = buffer.toString("hex");
  if (hex.length !== 32) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function audioSocketFrame(type, payload = Buffer.alloc(0)) {
  const header = Buffer.allocUnsafe(3);
  header[0] = type;
  header.writeUInt16BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

function wavFromPcm16Mono(pcm, sampleRate = 8000) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function parseWavPcm16(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("SECRETARY_GATEWAY_TTS_WAV_INVALID");
  }
  let offset = 12;
  let channels = 1;
  let sampleRate = 8000;
  let bitsPerSample = 16;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt " && size >= 16 && start + size <= buffer.length) {
      const format = buffer.readUInt16LE(start);
      if (format !== 1) throw new Error("SECRETARY_GATEWAY_TTS_WAV_PCM_REQUIRED");
      channels = buffer.readUInt16LE(start + 2);
      sampleRate = buffer.readUInt32LE(start + 4);
      bitsPerSample = buffer.readUInt16LE(start + 14);
    } else if (id === "data" && start + size <= buffer.length) {
      data = buffer.subarray(start, start + size);
      break;
    }
    offset = start + size + (size % 2);
  }
  if (!data || bitsPerSample !== 16 || channels < 1) throw new Error("SECRETARY_GATEWAY_TTS_WAV_FORMAT_UNSUPPORTED");

  const frameCount = Math.floor(data.length / (2 * channels));
  const mono = Buffer.allocUnsafe(frameCount * 2);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let total = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      total += data.readInt16LE((frame * channels + channel) * 2);
    }
    mono.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(total / channels))), frame * 2);
  }
  return { pcm: mono, sampleRate };
}

function resamplePcm16Mono(pcm, sourceRate, targetRate = 8000) {
  if (sourceRate === targetRate) return pcm;
  const sourceFrames = Math.floor(pcm.length / 2);
  if (!sourceFrames) return Buffer.alloc(0);
  const targetFrames = Math.max(1, Math.round(sourceFrames * targetRate / sourceRate));
  const output = Buffer.allocUnsafe(targetFrames * 2);
  for (let index = 0; index < targetFrames; index += 1) {
    const sourcePosition = index * sourceRate / targetRate;
    const left = Math.min(sourceFrames - 1, Math.floor(sourcePosition));
    const right = Math.min(sourceFrames - 1, left + 1);
    const fraction = sourcePosition - left;
    const value = pcm.readInt16LE(left * 2) * (1 - fraction) + pcm.readInt16LE(right * 2) * fraction;
    output.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value))), index * 2);
  }
  return output;
}

function averageAmplitude(pcm) {
  const samples = Math.floor(pcm.length / 2);
  if (!samples) return 0;
  let sum = 0;
  for (let index = 0; index < samples; index += 1) sum += Math.abs(pcm.readInt16LE(index * 2));
  return sum / samples;
}

function durationMsForPcm(pcm, sampleRate = 8000) {
  return pcm.length / (sampleRate * 2) * 1000;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function playPcm(socket, pcm) {
  const bytesPer20ms = 320;
  for (let offset = 0; offset < pcm.length && !socket.destroyed; offset += bytesPer20ms) {
    socket.write(audioSocketFrame(0x10, pcm.subarray(offset, Math.min(pcm.length, offset + bytesPer20ms))));
    await sleep(20);
  }
}

class AmiClient {
  constructor() {
    this.socket = null;
    this.buffer = "";
    this.pending = new Map();
    this.listeners = new Set();
    this.connecting = null;
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async connect() {
    if (this.socket && !this.socket.destroyed) return;
    if (this.connecting) return this.connecting;
    this.connecting = new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: AMI_HOST, port: AMI_PORT });
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error("ASTERISK_AMI_CONNECT_TIMEOUT"));
      }, 10000);
      socket.setEncoding("utf8");
      socket.on("data", (chunk) => this.consume(chunk));
      socket.on("error", (error) => {
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
      });
      socket.on("close", () => {
        this.socket = null;
      });
      socket.once("connect", async () => {
        clearTimeout(timeout);
        this.socket = socket;
        try {
          const login = await this.action({ Action: "Login", Username: AMI_USERNAME, Secret: AMI_SECRET, Events: "on" });
          if (clean(login.Response).toLowerCase() !== "success") throw new Error(`ASTERISK_AMI_LOGIN_FAILED:${clean(login.Message)}`);
          resolve();
        } catch (error) {
          socket.destroy();
          reject(error);
        }
      });
    }).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  consume(chunk) {
    this.buffer += chunk;
    let boundary;
    while ((boundary = this.buffer.indexOf("\r\n\r\n")) >= 0) {
      const raw = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 4);
      if (!raw.trim() || raw.startsWith("Asterisk Call Manager/")) continue;
      const frame = {};
      for (const line of raw.split("\r\n")) {
        const separator = line.indexOf(":");
        if (separator < 0) continue;
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        if (frame[key] === undefined) frame[key] = value;
        else if (Array.isArray(frame[key])) frame[key].push(value);
        else frame[key] = [frame[key], value];
      }
      const actionId = clean(frame.ActionID, 200);
      if (frame.Response && actionId && this.pending.has(actionId)) {
        const pending = this.pending.get(actionId);
        this.pending.delete(actionId);
        pending.resolve(frame);
      }
      if (frame.Event) {
        for (const listener of this.listeners) Promise.resolve(listener(frame)).catch((error) => console.error("AMI_EVENT_HANDLER_FAILED", error.message));
      }
    }
  }

  async action(fields) {
    if (!this.socket || this.socket.destroyed) {
      if (fields.Action !== "Login") await this.connect();
    }
    const actionId = clean(fields.ActionID, 200) || randomUUID();
    const lines = [];
    for (const [key, rawValue] of Object.entries({ ...fields, ActionID: actionId })) {
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      for (const value of values) {
        if (value === undefined || value === null || value === "") continue;
        lines.push(`${safeHeader(key)}: ${safeHeader(value)}`);
      }
    }
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(actionId);
        reject(new Error(`ASTERISK_AMI_ACTION_TIMEOUT:${clean(fields.Action)}`));
      }, 10000);
      this.pending.set(actionId, {
        resolve: (frame) => { clearTimeout(timer); resolve(frame); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
    });
    this.socket.write(`${lines.join("\r\n")}\r\n\r\n`);
    return promise;
  }
}

const ami = new AmiClient();

function outboundChannel(destination, phoneLineId) {
  const safeDestination = safeHeader(destination);
  const safeLine = safeHeader(phoneLineId || "");
  return OUTBOUND_CHANNEL_TEMPLATE.replaceAll("{destination}", safeDestination).replaceAll("{line}", safeLine);
}

async function postOutboundStatus(session, status, extra = {}) {
  if (session.terminal) return null;
  const body = await postJson(session.callbacks.status_url, session.callbacks.authorization, {
    requestId: session.requestId,
    claimToken: session.claimToken,
    status,
    ...extra,
  });
  if (status === "CONNECTED") {
    session.callId = clean(body?.request?.call_id, 120) || session.callId;
    session.connected = true;
  }
  if (status === "COMPLETED" || status === "FAILED") session.terminal = true;
  return body;
}

async function startOutbound(payload) {
  const requestId = clean(payload.request_id, 120);
  const claimToken = clean(payload.claim_token, 120);
  const destination = clean(payload.destination, 500);
  const callbacks = payload.callbacks || {};
  if (!requestId || !claimToken || !destination || !callbacks.status_url || !callbacks.voice_turn_url || !callbacks.authorization) {
    throw new Error("SECRETARY_GATEWAY_OUTBOUND_CONTRACT_INVALID");
  }
  const audioUuid = randomUUID();
  const actionId = randomUUID();
  const dispatchId = randomUUID();
  const session = {
    direction: "OUTBOUND",
    dispatchId,
    requestId,
    claimToken,
    phoneLineId: clean(payload.phone_line_id, 120) || null,
    destination,
    language: clean(payload.language, 80) || null,
    objective: clean(payload.objective, 4000),
    callbacks: {
      status_url: clean(callbacks.status_url, 2000),
      voice_turn_url: clean(callbacks.voice_turn_url, 2000),
      authorization: clean(callbacks.authorization, 9000),
    },
    audioUuid,
    actionId,
    callId: null,
    connected: false,
    terminal: false,
  };
  sessionsByAudioUuid.set(audioUuid, session);
  sessionsByActionId.set(actionId, session);

  const response = await ami.action({
    Action: "Originate",
    ActionID: actionId,
    Channel: outboundChannel(destination, session.phoneLineId),
    Context: OUTBOUND_CONTEXT,
    Exten: OUTBOUND_EXTEN,
    Priority: "1",
    Timeout: "30000",
    Async: "true",
    Variable: [
      `AVANTIQO_AUDIO_UUID=${audioUuid}`,
      `AVANTIQO_AUDIO_SERVICE=${safeHeader(AUDIO_SERVICE)}`,
      `AVANTIQO_REQUEST_ID=${requestId}`,
    ],
  });
  if (clean(response.Response).toLowerCase() !== "success") {
    sessionsByAudioUuid.delete(audioUuid);
    sessionsByActionId.delete(actionId);
    throw new Error(`ASTERISK_ORIGINATE_REJECTED:${clean(response.Message, 1000)}`);
  }
  return { accepted: true, dispatch_id: dispatchId, audio_uuid: audioUuid };
}

async function startInbound(payload) {
  const phoneLineId = clean(payload.phone_line_id || payload.phoneLineId, 120);
  const remoteAddress = clean(payload.remote_address || payload.remoteAddress, 500) || null;
  const language = clean(payload.language, 80) || null;
  if (!phoneLineId) throw new Error("SECRETARY_GATEWAY_INBOUND_PHONE_LINE_REQUIRED");
  const started = await postJson(`${AVANTIQO_BASE_URL}/api/internal/secretary/calls/start`, `Bearer ${INGRESS_TOKEN}`, {
    phoneLineId,
    remoteAddress,
    language,
    autoAnswer: true,
  });
  const callId = clean(started.call_id, 120);
  if (!callId) throw new Error("SECRETARY_GATEWAY_INBOUND_CALL_ID_REQUIRED");
  const audioUuid = randomUUID();
  const session = {
    direction: "INBOUND",
    dispatchId: randomUUID(),
    requestId: null,
    claimToken: null,
    phoneLineId,
    destination: remoteAddress,
    language,
    objective: null,
    callbacks: {
      voice_turn_url: `${AVANTIQO_BASE_URL}/api/internal/secretary/calls/turn`,
      authorization: `Bearer ${INGRESS_TOKEN}`,
    },
    audioUuid,
    actionId: null,
    callId,
    connected: true,
    terminal: false,
  };
  sessionsByAudioUuid.set(audioUuid, session);
  return {
    accepted: true,
    call_id: callId,
    audio_uuid: audioUuid,
    greeting: started.greeting || null,
    default_language: started.default_language || null,
  };
}

ami.onEvent(async (event) => {
  if (event.Event !== "OriginateResponse") return;
  const session = sessionsByActionId.get(clean(event.ActionID, 200));
  if (!session || session.terminal) return;
  const response = clean(event.Response).toLowerCase();
  if (response === "failure" && !session.connected) {
    await postOutboundStatus(session, "FAILED", {
      error: `ASTERISK_ORIGINATE_FAILED:${clean(event.Reason || event.Response, 200)}`,
    }).catch((error) => console.error("OUTBOUND_FAILURE_CALLBACK_FAILED", error.message));
    sessionsByAudioUuid.delete(session.audioUuid);
    sessionsByActionId.delete(session.actionId);
  }
});

async function voiceTurn(session, pcm) {
  if (!session.callId || !pcm.length) return;
  const wav = wavFromPcm16Mono(pcm, 8000);
  const result = await postJson(session.callbacks.voice_turn_url, session.callbacks.authorization, {
    callId: session.callId,
    language: session.language,
    mimeType: "audio/wav",
    fileName: `secretary-${session.callId}.wav`,
    audioBase64: wav.toString("base64"),
  }, 300000);
  const audioBase64 = clean(result.audio_base64, 100000000);
  if (!audioBase64) return;
  const parsed = parseWavPcm16(Buffer.from(audioBase64, "base64"));
  return resamplePcm16Mono(parsed.pcm, parsed.sampleRate, 8000);
}

function attachAudioSession(socket, session) {
  const state = {
    buffer: Buffer.alloc(0),
    speech: [],
    speechMs: 0,
    silenceMs: 0,
    speaking: false,
    processing: false,
    playing: false,
    closed: false,
  };

  const flushSpeech = async () => {
    if (state.processing || !state.speech.length) return;
    const pcm = Buffer.concat(state.speech);
    state.speech = [];
    state.speechMs = 0;
    state.silenceMs = 0;
    state.speaking = false;
    if (durationMsForPcm(pcm) < VAD_MIN_SPEECH_MS) return;
    state.processing = true;
    try {
      const reply = await voiceTurn(session, pcm);
      if (reply?.length && !socket.destroyed) {
        state.playing = true;
        await playPcm(socket, reply);
      }
    } catch (error) {
      console.error("SECRETARY_GATEWAY_VOICE_TURN_FAILED", session.callId, error.message);
    } finally {
      state.playing = false;
      state.processing = false;
    }
  };

  const handlePcm = (pcm) => {
    if (state.playing) return;
    const frameMs = durationMsForPcm(pcm);
    const voiced = averageAmplitude(pcm) >= VAD_THRESHOLD;
    if (voiced) {
      state.speaking = true;
      state.silenceMs = 0;
    } else if (state.speaking) {
      state.silenceMs += frameMs;
    }
    if (state.speaking) {
      state.speech.push(pcm);
      state.speechMs += frameMs;
    }
    if (state.speaking && (state.silenceMs >= VAD_SILENCE_MS || state.speechMs >= VAD_MAX_SPEECH_MS)) {
      void flushSpeech();
    }
  };

  socket.on("data", (chunk) => {
    state.buffer = Buffer.concat([state.buffer, chunk]);
    while (state.buffer.length >= 3) {
      const type = state.buffer[0];
      const length = state.buffer.readUInt16BE(1);
      if (state.buffer.length < 3 + length) break;
      const payload = state.buffer.subarray(3, 3 + length);
      state.buffer = state.buffer.subarray(3 + length);
      if (type === 0x00) {
        socket.end();
        break;
      }
      if (type === 0x10) handlePcm(payload);
      if (type === 0xff) console.error("ASTERISK_AUDIOSOCKET_ERROR", payload.toString("hex"));
    }
  });

  const close = async () => {
    if (state.closed) return;
    state.closed = true;
    if (state.speech.length && !state.processing) await flushSpeech();
    if (session.direction === "OUTBOUND" && !session.terminal) {
      await postOutboundStatus(session, session.connected ? "COMPLETED" : "FAILED", {
        summary: session.connected ? "SIP call ended" : null,
        error: session.connected ? null : "SIP_MEDIA_ENDED_BEFORE_CONNECT",
      }).catch((error) => console.error("OUTBOUND_TERMINAL_CALLBACK_FAILED", error.message));
    } else if (session.direction === "INBOUND" && !session.terminal) {
      session.terminal = true;
      await postJson(`${AVANTIQO_BASE_URL}/api/internal/secretary/calls/end`, `Bearer ${INGRESS_TOKEN}`, {
        callId: session.callId,
        status: "COMPLETED",
        summary: "SIP call ended",
      }).catch((error) => console.error("INBOUND_END_CALLBACK_FAILED", error.message));
    }
    sessionsByAudioUuid.delete(session.audioUuid);
    if (session.actionId) sessionsByActionId.delete(session.actionId);
  };

  socket.once("close", close);
  socket.once("error", (error) => console.error("ASTERISK_AUDIOSOCKET_CONNECTION_FAILED", session.audioUuid, error.message));
}

const audioServer = net.createServer((socket) => {
  let buffer = Buffer.alloc(0);
  const identify = async (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length < 3) return;
    const type = buffer[0];
    const length = buffer.readUInt16BE(1);
    if (buffer.length < 3 + length) return;
    if (type !== 0x01 || length !== 16) {
      socket.destroy(new Error("ASTERISK_AUDIOSOCKET_UUID_REQUIRED"));
      return;
    }
    const audioUuid = uuidBufferToString(buffer.subarray(3, 19));
    const remainder = buffer.subarray(19);
    socket.off("data", identify);
    const session = audioUuid ? sessionsByAudioUuid.get(audioUuid) : null;
    if (!session) {
      socket.destroy(new Error("ASTERISK_AUDIOSOCKET_SESSION_UNKNOWN"));
      return;
    }
    if (session.direction === "OUTBOUND" && !session.connected) {
      try {
        await postOutboundStatus(session, "CONNECTED");
      } catch (error) {
        socket.destroy(error);
        return;
      }
    }
    attachAudioSession(socket, session);
    if (remainder.length) socket.emit("data", remainder);
  };
  socket.on("data", identify);
});

const httpServer = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse(response, 200, {
        ok: requireRuntimeConfig().length === 0,
        contract: "AVANTIQO_SECRETARY_ASTERISK_GATEWAY_V1",
        missing: requireRuntimeConfig(),
        sessions: sessionsByAudioUuid.size,
        raw_audio_persisted: false,
      });
    }
    if (!authorized(request)) return jsonResponse(response, 401, { accepted: false, error: "Unauthorized" });
    if (request.method === "POST" && url.pathname === "/v1/secretary/calls") {
      const missing = requireRuntimeConfig();
      if (missing.length) return jsonResponse(response, 503, { accepted: false, error: "Gateway not configured", missing });
      const result = await startOutbound(await readJson(request));
      return jsonResponse(response, 202, result);
    }
    if (request.method === "POST" && url.pathname === "/v1/secretary/inbound/start") {
      const missing = requireRuntimeConfig();
      if (missing.length) return jsonResponse(response, 503, { accepted: false, error: "Gateway not configured", missing });
      const result = await startInbound(await readJson(request));
      return jsonResponse(response, 200, result);
    }
    return jsonResponse(response, 404, { accepted: false, error: "Not found" });
  } catch (error) {
    console.error("SECRETARY_ASTERISK_GATEWAY_REQUEST_FAILED", error.message);
    return jsonResponse(response, 500, { accepted: false, error: error.message });
  }
});

async function shutdown(signal) {
  console.log("SECRETARY_ASTERISK_GATEWAY_SHUTDOWN", signal);
  httpServer.close();
  audioServer.close();
  for (const session of sessionsByAudioUuid.values()) {
    if (session.direction === "OUTBOUND" && !session.terminal) {
      await postOutboundStatus(session, "FAILED", { error: `GATEWAY_SHUTDOWN:${signal}` }).catch(() => {});
    }
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await ami.connect().catch((error) => console.error("ASTERISK_AMI_INITIAL_CONNECT_FAILED", error.message));
audioServer.listen(AUDIO_PORT, AUDIO_HOST, () => {
  console.log(`AVANTIQO_SECRETARY_AUDIOSOCKET_LISTEN=${AUDIO_HOST}:${AUDIO_PORT}`);
});
httpServer.listen(HTTP_PORT, HTTP_HOST, () => {
  console.log(`AVANTIQO_SECRETARY_GATEWAY_HTTP_LISTEN=${HTTP_HOST}:${HTTP_PORT}`);
  console.log(`AVANTIQO_SECRETARY_ASTERISK_GATEWAY_READY=${requireRuntimeConfig().length === 0}`);
});
