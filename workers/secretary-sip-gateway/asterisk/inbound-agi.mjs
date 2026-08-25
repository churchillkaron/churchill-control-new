#!/usr/bin/env node

import readline from "node:readline";

const GATEWAY_URL = String(process.env.SECRETARY_GATEWAY_LOCAL_URL || "http://127.0.0.1:8787").replace(/\/+$/, "");
const GATEWAY_TOKEN = String(process.env.AVANTIQO_SECRETARY_SIP_GATEWAY_TOKEN || "").trim();
const AVANTIQO_BASE_URL = String(process.env.AVANTIQO_SECRETARY_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const INGRESS_TOKEN = String(process.env.AVANTIQO_SECRETARY_CALL_GATEWAY_TOKEN || "").trim();
const PHONE_LINE_ID = String(process.env.AVANTIQO_SECRETARY_PHONE_LINE_ID || "").trim() || null;
const AUDIO_SERVICE = String(process.env.ASTERISK_SECRETARY_AUDIOSOCKET_SERVICE || "").trim();
const LANGUAGE = String(process.argv[2] || "").trim() || null;

function clean(value, limit = 2000) {
  return String(value ?? "").trim().slice(0, limit);
}

function normalizeCalledNumber(value) {
  let result = clean(value, 500);
  if (!result) return null;
  result = result.replace(/^sip:/i, "").split("@")[0].trim();
  return result || null;
}

function agiEscape(value) {
  return clean(value, 4000).replaceAll("\\", "\\\\").replaceAll('"', '\\"').replace(/[\r\n]/g, " ");
}

class AgiSession {
  constructor() {
    this.input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    this.lines = this.input[Symbol.asyncIterator]();
  }

  async nextLine(label) {
    const { value, done } = await this.lines.next();
    if (done) throw new Error(`AGI_INPUT_CLOSED:${label}`);
    return String(value ?? "").replace(/[\r\n]+$/, "");
  }

  async readEnvironment() {
    const environment = {};
    while (true) {
      const line = await this.nextLine("ENVIRONMENT");
      if (!line) break;
      const separator = line.indexOf(":");
      if (separator < 0) continue;
      environment[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
    return environment;
  }

  async command(line) {
    process.stdout.write(`${line}\n`);
    const response = clean(await this.nextLine("COMMAND_RESPONSE"), 4000);
    if (response === "HANGUP") throw new Error("AGI_CHANNEL_HUNG_UP");

    const match = /^200\s+result=(-?\d+)(?:\s|$)/i.exec(response);
    if (!match) throw new Error(`AGI_COMMAND_REJECTED:${response || "EMPTY_RESPONSE"}`);

    const result = Number(match[1]);
    if (!Number.isFinite(result) || result < 0) {
      throw new Error(`AGI_COMMAND_FAILED:${response}`);
    }
    return { result, response };
  }

  async setVariable(name, value) {
    return this.command(`SET VARIABLE ${name} "${agiEscape(value)}"`);
  }

  close() {
    this.input.close();
  }
}

async function postJson(url, authorization, body, timeoutMs = 15000) {
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
    throw new Error(`HTTP_REJECTED:${response.status}:${clean(parsed?.error || parsed?.message, 1000)}`);
  }
  return parsed;
}

async function resolvePhoneLine(calledNumber) {
  if (PHONE_LINE_ID) {
    return {
      phone_line_id: PHONE_LINE_ID,
      called_number: calledNumber,
      source: "STATIC_FALLBACK",
    };
  }
  if (!calledNumber) throw new Error("CALLED_NUMBER_REQUIRED");
  if (!AVANTIQO_BASE_URL || !INGRESS_TOKEN) {
    throw new Error("AVANTIQO_DID_RESOLVER_CONFIG_MISSING");
  }

  const resolved = await postJson(
    `${AVANTIQO_BASE_URL}/api/internal/secretary/phone-lines/resolve`,
    `Bearer ${INGRESS_TOKEN}`,
    { called_number: calledNumber },
  );
  const phoneLineId = clean(resolved?.phone_line_id, 120);
  if (!phoneLineId) throw new Error("DID_RESOLVER_PHONE_LINE_MISSING");
  return {
    phone_line_id: phoneLineId,
    called_number: normalizeCalledNumber(resolved?.called_number) || calledNumber,
    source: "AVANTIQO_DID_RESOLVER",
  };
}

async function setFailure(session, code) {
  await session.setVariable("AVANTIQO_SECRETARY_ACCEPTED", "0");
  await session.setVariable("AVANTIQO_SECRETARY_ERROR", clean(code, 1000));
}

async function main() {
  const session = new AgiSession();
  try {
    const environment = await session.readEnvironment();
    const calledNumber = normalizeCalledNumber(
      environment.agi_dnid || environment.agi_extension || environment.agi_request || "",
    );

    if (!GATEWAY_TOKEN || !AUDIO_SERVICE || (!PHONE_LINE_ID && !calledNumber)) {
      await setFailure(
        session,
        !GATEWAY_TOKEN
          ? "GATEWAY_TOKEN_MISSING"
          : !AUDIO_SERVICE
            ? "AUDIOSOCKET_SERVICE_MISSING"
            : "CALLED_NUMBER_OR_PHONE_LINE_ID_MISSING",
      );
      return;
    }

    const remoteAddress = clean(environment.agi_callerid || environment.agi_callingpres || "", 500) || null;
    try {
      const line = await resolvePhoneLine(calledNumber);
      const body = await postJson(
        `${GATEWAY_URL}/v1/secretary/inbound/start`,
        `Bearer ${GATEWAY_TOKEN}`,
        {
          phone_line_id: line.phone_line_id,
          remote_address: remoteAddress,
          language: LANGUAGE,
        },
      );
      if (body?.accepted !== true || !body?.call_id || !body?.audio_uuid) {
        throw new Error(`INBOUND_REGISTRATION_REJECTED:${clean(body?.error || body?.message, 1000)}`);
      }

      await session.setVariable("AVANTIQO_CALL_ID", body.call_id);
      await session.setVariable("AVANTIQO_PHONE_LINE_ID", line.phone_line_id);
      await session.setVariable("AVANTIQO_AUDIO_UUID", body.audio_uuid);
      await session.setVariable("AVANTIQO_AUDIO_SERVICE", AUDIO_SERVICE);
      if (line.called_number) await session.setVariable("AVANTIQO_CALLED_NUMBER", line.called_number);
      if (body.default_language) await session.setVariable("AVANTIQO_DEFAULT_LANGUAGE", body.default_language);
      await session.setVariable("AVANTIQO_SECRETARY_ERROR", "");
      await session.setVariable("AVANTIQO_SECRETARY_ACCEPTED", "1");
    } catch (error) {
      await setFailure(session, clean(error?.message || error, 1000));
    }
  } finally {
    session.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(`SECRETARY_INBOUND_AGI_ERROR=${clean(error?.message || error, 1000)}`);
  process.exitCode = 1;
}
