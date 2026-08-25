#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const ENV_PATH = resolve(process.cwd(), ".env.local");
const API_BASE = "https://api.telnyx.com/v2";
const CONNECTION_NAME = "Avantiqo Secretary Managed SIP";
const API_KEY = String(process.env.TELNYX_API_KEY || "").trim();

function clean(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readEnvText() {
  return existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
}

function getEnvValue(text, key) {
  const match = text.match(new RegExp(`^\\s*${escapeRegex(key)}\\s*=\\s*(.*)\\s*$`, "m"));
  if (!match) return "";
  const raw = clean(match[1], 12000);
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) return raw.slice(1, -1);
  return raw;
}

function upsertEnvValue(text, key, value) {
  const line = `${key}=${String(value).replace(/[\r\n]/g, "")}`;
  const pattern = new RegExp(`^\\s*${escapeRegex(key)}\\s*=.*$`, "m");
  if (pattern.test(text)) return text.replace(pattern, line);
  const prefix = text && !text.endsWith("\n") ? `${text}\n` : text;
  return `${prefix}${line}\n`;
}

async function telnyx(path, { method = "GET", body = null } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${API_KEY}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok) {
    const first = Array.isArray(parsed?.errors) ? parsed.errors[0] : null;
    const code = clean(first?.code || parsed?.code, 120) || `HTTP_${response.status}`;
    const detail = clean(first?.detail || first?.title || parsed?.message, 500) || "provider rejected request";
    throw new Error(`TELNYX_BOOTSTRAP_ERROR:${code}:${detail}`);
  }
  return parsed?.data ?? parsed;
}

function generatedUsername() {
  return `avantiqo${randomBytes(8).toString("hex")}`.slice(0, 32);
}

function generatedPassword() {
  return randomBytes(48).toString("base64url");
}

async function findExistingConnection() {
  const data = await telnyx("/credential_connections?page[size]=100");
  const rows = Array.isArray(data) ? data : [];
  return rows.find((row) => clean(row?.connection_name, 200) === CONNECTION_NAME && row?.active !== false) || null;
}

async function createConnection() {
  const userName = generatedUsername();
  const password = generatedPassword();
  const data = await telnyx("/credential_connections", {
    method: "POST",
    body: {
      connection_name: CONNECTION_NAME,
      user_name: userName,
      password,
      active: true,
      anchorsite_override: "Latency",
      sip_uri_calling_preference: "disabled",
      dtmf_type: "RFC 2833",
      encode_contact_header_enabled: true,
    },
  });
  return { ...data, user_name: clean(data?.user_name, 200) || userName, password: clean(data?.password, 12000) || password };
}

if (!API_KEY) {
  console.error("SECRETARY_MANAGED_TELEPHONY_BOOTSTRAP=FAIL");
  console.error("SECRETARY_MANAGED_TELEPHONY_MISSING=TELNYX_API_KEY");
  console.error("SECRETARY_MANAGED_TELEPHONY_SECRET_PRINTED=false");
  process.exit(1);
}

try {
  let envText = readEnvText();
  const configuredId = getEnvValue(envText, "AVANTIQO_SECRETARY_TELNYX_CONNECTION_ID");
  const configuredUser = getEnvValue(envText, "ASTERISK_SECRETARY_TRUNK_USERNAME");
  const configuredSecret = getEnvValue(envText, "ASTERISK_SECRETARY_TRUNK_SECRET");

  let connection = null;
  let created = false;
  if (configuredId) {
    connection = await telnyx(`/credential_connections/${encodeURIComponent(configuredId)}`);
  } else {
    connection = await findExistingConnection();
    if (!connection) {
      connection = await createConnection();
      created = true;
    }
  }

  const connectionId = clean(connection?.id, 200);
  const userName = clean(connection?.user_name, 200) || configuredUser;
  const password = clean(connection?.password, 12000) || configuredSecret;
  if (!connectionId || !userName || !password) throw new Error("TELNYX_BOOTSTRAP_CREDENTIALS_INCOMPLETE");

  envText = upsertEnvValue(envText, "AVANTIQO_SECRETARY_TELNYX_CONNECTION_ID", connectionId);
  envText = upsertEnvValue(envText, "ASTERISK_SECRETARY_TRUNK_ENDPOINT", "avantiqo-trunk");
  envText = upsertEnvValue(envText, "ASTERISK_SECRETARY_TRUNK_HOST", "sip.telnyx.com");
  envText = upsertEnvValue(envText, "ASTERISK_SECRETARY_TRUNK_PORT", "5060");
  envText = upsertEnvValue(envText, "ASTERISK_SECRETARY_TRUNK_PROTOCOL", "udp");
  envText = upsertEnvValue(envText, "ASTERISK_SECRETARY_TRUNK_USERNAME", userName);
  envText = upsertEnvValue(envText, "ASTERISK_SECRETARY_TRUNK_SECRET", password);
  envText = upsertEnvValue(envText, "ASTERISK_SECRETARY_TRUNK_REGISTER", "true");
  envText = upsertEnvValue(envText, "ASTERISK_SECRETARY_TRUNK_CLIENT_USER", userName);
  envText = upsertEnvValue(envText, "ASTERISK_SECRETARY_TRUNK_CONTACT_USER", userName);
  envText = upsertEnvValue(envText, "ASTERISK_SECRETARY_TRUNK_IDENTIFY_MATCH", "sip.telnyx.com");
  envText = upsertEnvValue(envText, "ASTERISK_SECRETARY_TRUNK_CODECS", "ulaw,alaw");
  envText = upsertEnvValue(envText, "SECRETARY_ASTERISK_PREFLIGHT_REQUIRE_TRUNK", "true");
  envText = upsertEnvValue(envText, "SECRETARY_ASTERISK_PREFLIGHT_REQUIRE_REGISTERED", "true");

  writeFileSync(ENV_PATH, envText, { encoding: "utf8", mode: 0o600 });
  try { chmodSync(ENV_PATH, 0o600); } catch {}

  console.log("SECRETARY_MANAGED_TELEPHONY_BOOTSTRAP=PASS");
  console.log(`SECRETARY_MANAGED_TELEPHONY_CONNECTION_CREATED=${created}`);
  console.log(`SECRETARY_MANAGED_TELEPHONY_CONNECTION_ID=${connectionId}`);
  console.log("SECRETARY_MANAGED_TELEPHONY_PROVIDER=telnyx");
  console.log("SECRETARY_MANAGED_TELEPHONY_TRUNK_HOST=sip.telnyx.com");
  console.log("SECRETARY_MANAGED_TELEPHONY_SECRET_PRINTED=false");
  console.log(`SECRETARY_MANAGED_TELEPHONY_PRICING_CONFIGURED=${Boolean(getEnvValue(envText, "AVANTIQO_SECRETARY_TELEPHONY_MARKUP_PERCENT"))}`);
  console.log("SECRETARY_MANAGED_TELEPHONY_CUSTOMER_CARRIER_CREDENTIALS_REQUIRED=false");
  console.log("SECRETARY_ASTERISK_CARRIER_CALL_PERFORMED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} catch (error) {
  console.error("SECRETARY_MANAGED_TELEPHONY_BOOTSTRAP=FAIL");
  console.error(`SECRETARY_MANAGED_TELEPHONY_ERROR=${clean(error?.message || error, 1000)}`);
  console.error("SECRETARY_MANAGED_TELEPHONY_SECRET_PRINTED=false");
  process.exitCode = 1;
}
