#!/usr/bin/env node

import readline from "node:readline";

const GATEWAY_URL = String(process.env.SECRETARY_GATEWAY_LOCAL_URL || "http://127.0.0.1:8787").replace(/\/+$/, "");
const GATEWAY_TOKEN = String(process.env.AVANTIQO_SECRETARY_SIP_GATEWAY_TOKEN || "").trim();
const PHONE_LINE_ID = String(process.argv[2] || process.env.AVANTIQO_SECRETARY_PHONE_LINE_ID || "").trim();
const LANGUAGE = String(process.argv[3] || "").trim() || null;

function clean(value, limit = 2000) {
  return String(value ?? "").trim().slice(0, limit);
}

function agiEscape(value) {
  return clean(value, 4000).replaceAll("\\", "\\\\").replaceAll('"', '\\"').replace(/[\r\n]/g, " ");
}

async function readAgiEnvironment() {
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  const environment = {};
  for await (const line of input) {
    if (!line) break;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    environment[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return environment;
}

function command(line) {
  process.stdout.write(`${line}\n`);
}

function setVariable(name, value) {
  command(`SET VARIABLE ${name} "${agiEscape(value)}"`);
}

async function main() {
  const environment = await readAgiEnvironment();
  if (!GATEWAY_TOKEN || !PHONE_LINE_ID) {
    setVariable("AVANTIQO_SECRETARY_ACCEPTED", "0");
    setVariable("AVANTIQO_SECRETARY_ERROR", !GATEWAY_TOKEN ? "GATEWAY_TOKEN_MISSING" : "PHONE_LINE_ID_MISSING");
    return;
  }

  const remoteAddress = clean(environment.agi_callerid || environment.agi_callingpres || "", 500) || null;
  try {
    const response = await fetch(`${GATEWAY_URL}/v1/secretary/inbound/start`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${GATEWAY_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        phone_line_id: PHONE_LINE_ID,
        remote_address: remoteAddress,
        language: LANGUAGE,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.accepted !== true || !body?.call_id || !body?.audio_uuid) {
      throw new Error(`INBOUND_REGISTRATION_REJECTED:${response.status}:${clean(body?.error || body?.message, 1000)}`);
    }

    setVariable("AVANTIQO_SECRETARY_ACCEPTED", "1");
    setVariable("AVANTIQO_CALL_ID", body.call_id);
    setVariable("AVANTIQO_AUDIO_UUID", body.audio_uuid);
    if (body.default_language) setVariable("AVANTIQO_DEFAULT_LANGUAGE", body.default_language);
  } catch (error) {
    setVariable("AVANTIQO_SECRETARY_ACCEPTED", "0");
    setVariable("AVANTIQO_SECRETARY_ERROR", clean(error?.message || error, 1000));
  }
}

await main();
