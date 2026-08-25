import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const GATEWAY_TOKEN = "local-gateway-token";
const INGRESS_TOKEN = "local-ingress-token";
const AMI_USERNAME = "secretary-smoke";
const AMI_SECRET = "local-ami-secret";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, { timeoutMs = 10000, intervalMs = 25, label = "condition" } = {}) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  const suffix = lastError ? `: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for ${label}${suffix}`);
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, HOST, resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, resolve);
  });
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve) => server.close(resolve));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function sendJson(response, status, body) {
  const encoded = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": encoded.length,
    "cache-control": "no-store",
  });
  response.end(encoded);
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

function pcmFrame(amplitude = 1800, samples = 160) {
  const frame = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    const value = index % 2 === 0 ? amplitude : -amplitude;
    frame.writeInt16LE(value, index * 2);
  }
  return frame;
}

function audioSocketFrame(type, payload = Buffer.alloc(0)) {
  const header = Buffer.alloc(3);
  header[0] = type;
  header.writeUInt16BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

function uuidToBuffer(uuid) {
  const hex = String(uuid || "").replaceAll("-", "");
  assert.match(hex, /^[0-9a-f]{32}$/i, "AudioSocket UUID must be a UUID");
  return Buffer.from(hex, "hex");
}

function parseAmiFrame(raw) {
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
  return frame;
}

function createFakeAmi() {
  const state = {
    loginCount: 0,
    originates: [],
  };
  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    let buffer = "";
    let greetingHeld = true;

    // Deliberately hold the greeting until the Login response so both arrive in one TCP flush.
    // This reproduces the AMI framing edge that previously swallowed the Login response.
    socket.cork();
    socket.write("Asterisk Call Manager/10.0.0\r\n");

    socket.on("data", (chunk) => {
      buffer += chunk;
      let boundary;
      while ((boundary = buffer.indexOf("\r\n\r\n")) >= 0) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 4);
        if (!raw.trim()) continue;
        const frame = parseAmiFrame(raw);
        const actionId = frame.ActionID;

        if (frame.Action === "Login") {
          state.loginCount += 1;
          assert.equal(frame.Username, AMI_USERNAME);
          assert.equal(frame.Secret, AMI_SECRET);
          socket.write(`Response: Success\r\nMessage: Authentication accepted\r\nActionID: ${actionId}\r\n\r\n`);
          if (greetingHeld) {
            greetingHeld = false;
            socket.uncork();
          }
          continue;
        }

        if (frame.Action === "Originate") {
          state.originates.push(frame);
          socket.write(`Response: Success\r\nMessage: Originate successfully queued\r\nActionID: ${actionId}\r\n\r\n`);
          setTimeout(() => {
            if (!socket.destroyed) {
              socket.write(`Event: OriginateResponse\r\nActionID: ${actionId}\r\nResponse: Success\r\nReason: 4\r\n\r\n`);
            }
          }, 10);
          continue;
        }

        socket.write(`Response: Error\r\nMessage: Unsupported action\r\nActionID: ${actionId}\r\n\r\n`);
      }
    });
  });
  return { server, state };
}

function createFakeAvantiqo() {
  const replyPcm = Buffer.concat(Array.from({ length: 10 }, () => pcmFrame(1200)));
  const replyWav = wavFromPcm16Mono(replyPcm, 8000).toString("base64");
  const state = {
    outboundStatuses: [],
    inboundStarts: [],
    turns: [],
    inboundEnds: [],
  };

  const server = http.createServer(async (request, response) => {
    try {
      if (request.headers.authorization !== `Bearer ${INGRESS_TOKEN}`) {
        return sendJson(response, 401, { success: false, error: "Unauthorized" });
      }
      const body = await readJson(request);
      const path = new URL(request.url, `http://${request.headers.host}`).pathname;

      if (request.method === "POST" && path === "/api/internal/secretary/calls/outbound/status") {
        state.outboundStatuses.push(body);
        const callId = body.status === "CONNECTED" ? "smoke-outbound-call" : "smoke-outbound-call";
        return sendJson(response, 200, {
          success: true,
          request: { id: body.requestId, status: body.status, call_id: callId },
        });
      }

      if (request.method === "POST" && path === "/api/internal/secretary/calls/start") {
        state.inboundStarts.push(body);
        return sendJson(response, 200, {
          success: true,
          call_id: "smoke-inbound-call",
          status: "ANSWERED",
          greeting: "Hello from Avantiqo Secretary",
          default_language: "en",
          timezone: "UTC",
        });
      }

      if (request.method === "POST" && path === "/api/internal/secretary/calls/turn") {
        state.turns.push(body);
        const input = Buffer.from(body.audioBase64 || body.audio_base64 || "", "base64");
        assert.equal(input.toString("ascii", 0, 4), "RIFF", "Gateway must send WAV to Avantiqo voice turn");
        return sendJson(response, 200, {
          success: true,
          transcript: "smoke transcript",
          response_text: "smoke response",
          response_language: "en",
          audio_base64: replyWav,
          audio_mime_type: "audio/wav",
          raw_audio_persisted: false,
        });
      }

      if (request.method === "POST" && path === "/api/internal/secretary/calls/end") {
        state.inboundEnds.push(body);
        return sendJson(response, 200, { success: true, call_id: body.callId, status: body.status });
      }

      return sendJson(response, 404, { success: false, error: "Not found" });
    } catch (error) {
      return sendJson(response, 500, { success: false, error: error.message });
    }
  });

  return { server, state };
}

async function postJson(url, token, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`HTTP_${response.status}:${parsed.error || "request failed"}`);
  return parsed;
}

async function openAudioSocket(port, audioUuid) {
  const socket = net.createConnection({ host: HOST, port });
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });

  const state = { buffer: Buffer.alloc(0), audioFrames: 0, audioBytes: 0 };
  socket.on("data", (chunk) => {
    state.buffer = Buffer.concat([state.buffer, chunk]);
    while (state.buffer.length >= 3) {
      const type = state.buffer[0];
      const length = state.buffer.readUInt16BE(1);
      if (state.buffer.length < 3 + length) break;
      const payload = state.buffer.subarray(3, 3 + length);
      state.buffer = state.buffer.subarray(3 + length);
      if (type === 0x10) {
        state.audioFrames += 1;
        state.audioBytes += payload.length;
      }
    }
  });
  socket.write(audioSocketFrame(0x01, uuidToBuffer(audioUuid)));
  return { socket, state };
}

function sendUtterance(socket) {
  const voiced = pcmFrame(2000);
  const silence = Buffer.alloc(320);
  for (let index = 0; index < 30; index += 1) socket.write(audioSocketFrame(0x10, voiced));
  for (let index = 0; index < 40; index += 1) socket.write(audioSocketFrame(0x10, silence));
}

async function terminateAudio(socket) {
  if (socket.destroyed) return;
  socket.write(audioSocketFrame(0x00));
  await Promise.race([
    new Promise((resolve) => socket.once("close", resolve)),
    sleep(2000),
  ]);
  if (!socket.destroyed) socket.destroy();
}

const amiPort = await freePort();
const avantiqoPort = await freePort();
const gatewayHttpPort = await freePort();
const gatewayAudioPort = await freePort();
const fakeAmi = createFakeAmi();
const fakeAvantiqo = createFakeAvantiqo();
let gateway = null;
const gatewayStdout = [];
const gatewayStderr = [];
let gatewayExited = false;

try {
  await listen(fakeAmi.server, amiPort);
  await listen(fakeAvantiqo.server, avantiqoPort);
  const avantiqoBase = `http://${HOST}:${avantiqoPort}`;
  const gatewayBase = `http://${HOST}:${gatewayHttpPort}`;

  gateway = spawn(process.execPath, [fileURLToPath(new URL("./server.mjs", import.meta.url))], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      SECRETARY_GATEWAY_HTTP_HOST: HOST,
      SECRETARY_GATEWAY_HTTP_PORT: String(gatewayHttpPort),
      SECRETARY_GATEWAY_AUDIO_HOST: HOST,
      SECRETARY_GATEWAY_AUDIO_PORT: String(gatewayAudioPort),
      AVANTIQO_SECRETARY_SIP_GATEWAY_TOKEN: GATEWAY_TOKEN,
      AVANTIQO_SECRETARY_PUBLIC_BASE_URL: avantiqoBase,
      AVANTIQO_SECRETARY_CALL_GATEWAY_TOKEN: INGRESS_TOKEN,
      ASTERISK_AMI_HOST: HOST,
      ASTERISK_AMI_PORT: String(amiPort),
      ASTERISK_AMI_USERNAME: AMI_USERNAME,
      ASTERISK_AMI_SECRET: AMI_SECRET,
      ASTERISK_SECRETARY_OUTBOUND_CONTEXT: "avantiqo-secretary-outbound",
      ASTERISK_SECRETARY_OUTBOUND_EXTEN: "s",
      ASTERISK_SECRETARY_OUTBOUND_CHANNEL_TEMPLATE: "PJSIP/{destination}@smoke-trunk",
      ASTERISK_SECRETARY_AUDIOSOCKET_SERVICE: `${HOST}:${gatewayAudioPort}`,
      SECRETARY_GATEWAY_VAD_THRESHOLD: "200",
      SECRETARY_GATEWAY_VAD_SILENCE_MS: "500",
      SECRETARY_GATEWAY_VAD_MIN_SPEECH_MS: "200",
      SECRETARY_GATEWAY_VAD_MAX_SPEECH_MS: "5000",
    },
  });
  gateway.stdout.on("data", (chunk) => gatewayStdout.push(chunk.toString("utf8")));
  gateway.stderr.on("data", (chunk) => gatewayStderr.push(chunk.toString("utf8")));
  gateway.once("exit", () => { gatewayExited = true; });

  const health = await waitFor(async () => {
    if (gatewayExited) throw new Error(`gateway exited: ${gatewayStderr.join("").slice(-2000)}`);
    const response = await fetch(`${gatewayBase}/health`).catch(() => null);
    if (!response?.ok) return null;
    const body = await response.json();
    return body.ok ? body : null;
  }, { label: "gateway health" });
  assert.deepEqual(health.missing, []);
  assert.equal(health.contract, "AVANTIQO_SECRETARY_ASTERISK_GATEWAY_V1");
  assert.equal(health.raw_audio_persisted, false);
  assert.equal(fakeAmi.state.loginCount, 1, "Gateway must survive coalesced AMI greeting + Login response");

  const outbound = await postJson(`${gatewayBase}/v1/secretary/calls`, GATEWAY_TOKEN, {
    contract: "AVANTIQO_SECRETARY_SIP_GATEWAY_V1",
    request_id: "smoke-request-1",
    claim_token: "smoke-claim-1",
    phone_line_id: "smoke-line-1",
    destination: "+66812345678",
    language: "en",
    objective: "Return the caller's requested callback.",
    callbacks: {
      status_url: `${avantiqoBase}/api/internal/secretary/calls/outbound/status`,
      voice_turn_url: `${avantiqoBase}/api/internal/secretary/calls/turn`,
      authorization: `Bearer ${INGRESS_TOKEN}`,
    },
  });
  assert.equal(outbound.accepted, true);
  assert.ok(outbound.audio_uuid);

  const originate = await waitFor(() => fakeAmi.state.originates[0], { label: "AMI Originate" });
  assert.equal(originate.Channel, "PJSIP/+66812345678@smoke-trunk");
  assert.equal(originate.Context, "avantiqo-secretary-outbound");
  const variables = Array.isArray(originate.Variable) ? originate.Variable : [originate.Variable];
  assert.ok(variables.includes(`AVANTIQO_AUDIO_UUID=${outbound.audio_uuid}`));
  assert.ok(variables.includes("AVANTIQO_REQUEST_ID=smoke-request-1"));

  const outboundAudio = await openAudioSocket(gatewayAudioPort, outbound.audio_uuid);
  await waitFor(
    () => fakeAvantiqo.state.outboundStatuses.some((item) => item.status === "CONNECTED"),
    { label: "outbound CONNECTED callback" },
  );
  sendUtterance(outboundAudio.socket);
  await waitFor(
    () => fakeAvantiqo.state.turns.some((item) => item.callId === "smoke-outbound-call"),
    { timeoutMs: 15000, label: "outbound Avantiqo voice turn" },
  );
  await waitFor(() => outboundAudio.state.audioFrames > 0, { timeoutMs: 15000, label: "outbound TTS audio" });
  assert.ok(outboundAudio.state.audioBytes > 0);
  await terminateAudio(outboundAudio.socket);
  await waitFor(
    () => fakeAvantiqo.state.outboundStatuses.some((item) => item.status === "COMPLETED"),
    { label: "outbound COMPLETED callback" },
  );

  const inbound = await postJson(`${gatewayBase}/v1/secretary/inbound/start`, GATEWAY_TOKEN, {
    phone_line_id: "smoke-line-inbound",
    remote_address: "+66887654321",
    language: "en",
  });
  assert.equal(inbound.accepted, true);
  assert.equal(inbound.call_id, "smoke-inbound-call");
  assert.ok(inbound.audio_uuid);
  assert.equal(fakeAvantiqo.state.inboundStarts.length, 1);
  assert.equal(fakeAvantiqo.state.inboundStarts[0].remoteAddress, "+66887654321");

  const inboundAudio = await openAudioSocket(gatewayAudioPort, inbound.audio_uuid);
  const turnCountBeforeInbound = fakeAvantiqo.state.turns.length;
  sendUtterance(inboundAudio.socket);
  await waitFor(
    () => fakeAvantiqo.state.turns.length > turnCountBeforeInbound &&
      fakeAvantiqo.state.turns.some((item) => item.callId === "smoke-inbound-call"),
    { timeoutMs: 15000, label: "inbound Avantiqo voice turn" },
  );
  await waitFor(() => inboundAudio.state.audioFrames > 0, { timeoutMs: 15000, label: "inbound TTS audio" });
  await terminateAudio(inboundAudio.socket);
  await waitFor(
    () => fakeAvantiqo.state.inboundEnds.some((item) => item.callId === "smoke-inbound-call"),
    { label: "inbound call end" },
  );

  assert.equal(fakeAvantiqo.state.outboundStatuses.filter((item) => item.status === "CONNECTED").length, 1);
  assert.equal(fakeAvantiqo.state.outboundStatuses.filter((item) => item.status === "COMPLETED").length, 1);
  assert.ok(fakeAvantiqo.state.turns.length >= 2);

  console.log("SECRETARY_SIP_GATEWAY_LOCAL_SMOKE=PASS");
  console.log("SECRETARY_SIP_GATEWAY_AMI_GREETING_FRAMING=PASS");
  console.log("SECRETARY_SIP_GATEWAY_OUTBOUND_AUDIOSOCKET=PASS");
  console.log("SECRETARY_SIP_GATEWAY_INBOUND_AUDIOSOCKET=PASS");
  console.log("SECRETARY_SIP_GATEWAY_VOICE_TURN_LOOP=PASS");
  console.log("SECRETARY_SIP_GATEWAY_CARRIER_SPEND_PERFORMED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} catch (error) {
  console.error(error.stack || error.message || error);
  if (gatewayStdout.length) console.error("GATEWAY_STDOUT\n" + gatewayStdout.join("").slice(-4000));
  if (gatewayStderr.length) console.error("GATEWAY_STDERR\n" + gatewayStderr.join("").slice(-4000));
  process.exitCode = 1;
} finally {
  if (gateway && !gatewayExited) {
    gateway.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => gateway.once("exit", resolve)),
      sleep(2000),
    ]);
    if (!gatewayExited) gateway.kill("SIGKILL");
  }
  await Promise.all([
    closeServer(fakeAmi.server),
    closeServer(fakeAvantiqo.server),
  ]);
}
