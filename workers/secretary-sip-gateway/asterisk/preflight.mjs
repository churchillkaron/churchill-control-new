import assert from "node:assert/strict";
import net from "node:net";
import { randomUUID } from "node:crypto";

const env = process.env;
const HOST = String(env.ASTERISK_AMI_HOST || "127.0.0.1").trim();
const PORT = Number(env.ASTERISK_AMI_PORT || 5038);
const USERNAME = String(env.ASTERISK_AMI_USERNAME || "").trim();
const SECRET = String(env.ASTERISK_AMI_SECRET || "").trim();
const INBOUND_CONTEXT = String(env.ASTERISK_SECRETARY_INBOUND_CONTEXT || "avantiqo-secretary-inbound").trim();
const OUTBOUND_CONTEXT = String(env.ASTERISK_SECRETARY_OUTBOUND_CONTEXT || "avantiqo-secretary-outbound").trim();
const OUTBOUND_EXTEN = String(env.ASTERISK_SECRETARY_OUTBOUND_EXTEN || "s").trim();
const TRUNK_ENDPOINT = String(env.ASTERISK_SECRETARY_TRUNK_ENDPOINT || "").trim();
const REQUIRE_TRUNK = /^(1|true|yes)$/i.test(String(env.SECRETARY_ASTERISK_PREFLIGHT_REQUIRE_TRUNK || ""));
const CONNECT_TIMEOUT_MS = Math.max(1000, Number(env.SECRETARY_ASTERISK_PREFLIGHT_CONNECT_TIMEOUT_MS || 10000));
const ACTION_TIMEOUT_MS = Math.max(1000, Number(env.SECRETARY_ASTERISK_PREFLIGHT_ACTION_TIMEOUT_MS || 10000));

function clean(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function safeHeader(value) {
  const result = clean(value, 4000);
  if (/\r|\n/.test(result)) throw new Error("ASTERISK_PREFLIGHT_AMI_HEADER_INVALID");
  return result;
}

function requireConfig() {
  const missing = [];
  if (!HOST) missing.push("ASTERISK_AMI_HOST");
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) missing.push("ASTERISK_AMI_PORT");
  if (!USERNAME) missing.push("ASTERISK_AMI_USERNAME");
  if (!SECRET) missing.push("ASTERISK_AMI_SECRET");
  if (!INBOUND_CONTEXT) missing.push("ASTERISK_SECRETARY_INBOUND_CONTEXT");
  if (!OUTBOUND_CONTEXT) missing.push("ASTERISK_SECRETARY_OUTBOUND_CONTEXT");
  if (!OUTBOUND_EXTEN) missing.push("ASTERISK_SECRETARY_OUTBOUND_EXTEN");
  if (REQUIRE_TRUNK && !TRUNK_ENDPOINT) missing.push("ASTERISK_SECRETARY_TRUNK_ENDPOINT");
  return missing;
}

function parseFrame(raw) {
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

class AmiPreflightClient {
  constructor() {
    this.socket = null;
    this.buffer = "";
    this.pending = new Map();
    this.greetingConsumed = false;
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: HOST, port: PORT });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("ASTERISK_PREFLIGHT_CONNECT_TIMEOUT"));
      }, CONNECT_TIMEOUT_MS);

      socket.setEncoding("utf8");
      socket.setKeepAlive(true, 30000);
      socket.on("data", (chunk) => this.consume(chunk));
      socket.on("error", (error) => {
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
      });
      socket.once("connect", () => {
        clearTimeout(timer);
        this.socket = socket;
        resolve();
      });
      socket.once("close", () => {
        if (this.socket === socket) this.socket = null;
      });
    });
  }

  consume(chunk) {
    this.buffer += chunk;
    if (!this.greetingConsumed && this.buffer.startsWith("Asterisk Call Manager/")) {
      const end = this.buffer.indexOf("\r\n");
      if (end < 0) return;
      this.buffer = this.buffer.slice(end + 2);
      this.greetingConsumed = true;
    }

    let boundary;
    while ((boundary = this.buffer.indexOf("\r\n\r\n")) >= 0) {
      const raw = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 4);
      if (!raw.trim()) continue;
      const frame = parseFrame(raw);
      const actionId = clean(frame.ActionID, 200);
      if (frame.Response && actionId && this.pending.has(actionId)) {
        const pending = this.pending.get(actionId);
        this.pending.delete(actionId);
        pending.resolve(frame);
      }
    }
  }

  async action(fields) {
    if (!this.socket || this.socket.destroyed) throw new Error("ASTERISK_PREFLIGHT_AMI_NOT_CONNECTED");
    const actionId = clean(fields.ActionID, 200) || randomUUID();
    const lines = [];
    for (const [key, rawValue] of Object.entries({ ...fields, ActionID: actionId })) {
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      for (const value of values) {
        if (value === undefined || value === null || value === "") continue;
        lines.push(`${safeHeader(key)}: ${safeHeader(value)}`);
      }
    }

    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(actionId);
        reject(new Error(`ASTERISK_PREFLIGHT_ACTION_TIMEOUT:${clean(fields.Action)}`));
      }, ACTION_TIMEOUT_MS);
      this.pending.set(actionId, {
        resolve: (frame) => {
          clearTimeout(timer);
          resolve(frame);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });

    this.socket.write(`${lines.join("\r\n")}\r\n\r\n`);
    return response;
  }

  close() {
    if (this.socket && !this.socket.destroyed) this.socket.destroy();
  }
}

function assertSuccess(frame, label) {
  assert.equal(
    clean(frame?.Response).toLowerCase(),
    "success",
    `${label} failed: ${clean(frame?.Message) || clean(frame?.Response) || "no response"}`,
  );
}

async function checkModule(client, moduleName) {
  const result = await client.action({ Action: "ModuleCheck", Module: moduleName });
  assertSuccess(result, `Module ${moduleName}`);
  return true;
}

async function checkDialplan(client, context, extension = "s") {
  const result = await client.action({
    Action: "ShowDialPlan",
    Context: context,
    Extension: extension,
  });
  assertSuccess(result, `Dialplan ${context}/${extension}`);
  return true;
}

async function checkEndpoint(client, endpoint) {
  const result = await client.action({
    Action: "PJSIPShowEndpoint",
    Endpoint: endpoint,
  });
  assertSuccess(result, `PJSIP endpoint ${endpoint}`);
  return true;
}

const missing = requireConfig();
if (missing.length) {
  console.error(`SECRETARY_ASTERISK_RUNTIME_PREFLIGHT=FAIL`);
  console.error(`SECRETARY_ASTERISK_PREFLIGHT_MISSING=${missing.join(",")}`);
  process.exit(1);
}

const client = new AmiPreflightClient();

try {
  await client.connect();
  const login = await client.action({
    Action: "Login",
    Username: USERNAME,
    Secret: SECRET,
    Events: "off",
  });
  assertSuccess(login, "AMI login");

  await checkModule(client, "app_audiosocket");
  await checkModule(client, "res_audiosocket");
  await checkModule(client, "res_pjsip");
  await checkModule(client, "chan_pjsip");

  await checkDialplan(client, INBOUND_CONTEXT, "s");
  await checkDialplan(client, OUTBOUND_CONTEXT, OUTBOUND_EXTEN);

  let trunkChecked = false;
  if (TRUNK_ENDPOINT) {
    await checkEndpoint(client, TRUNK_ENDPOINT);
    trunkChecked = true;
  } else if (REQUIRE_TRUNK) {
    throw new Error("ASTERISK_SECRETARY_TRUNK_ENDPOINT_REQUIRED");
  }

  console.log("SECRETARY_ASTERISK_RUNTIME_PREFLIGHT=PASS");
  console.log("SECRETARY_ASTERISK_AMI_LOGIN=PASS");
  console.log("SECRETARY_ASTERISK_AUDIOSOCKET_MODULES=PASS");
  console.log("SECRETARY_ASTERISK_PJSIP_MODULES=PASS");
  console.log("SECRETARY_ASTERISK_INBOUND_DIALPLAN=PASS");
  console.log("SECRETARY_ASTERISK_OUTBOUND_DIALPLAN=PASS");
  console.log(`SECRETARY_ASTERISK_TRUNK_ENDPOINT_CHECK=${trunkChecked ? "PASS" : "SKIPPED"}`);
  console.log(`SECRETARY_ASTERISK_TRUNK_REQUIRED=${REQUIRE_TRUNK}`);
  console.log("SECRETARY_ASTERISK_CARRIER_CALL_PERFORMED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} catch (error) {
  console.error("SECRETARY_ASTERISK_RUNTIME_PREFLIGHT=FAIL");
  console.error(`SECRETARY_ASTERISK_PREFLIGHT_ERROR=${clean(error?.message || error)}`);
  process.exitCode = 1;
} finally {
  client.close();
}
