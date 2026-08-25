#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ENV_PATH = resolve(process.cwd(), ".env.local");
const DEFAULT_USERNAME = "avantiqo-secretary";
const DEFAULT_LOCAL_APP_URL = "http://host.docker.internal:3000";
const MANAGER_FRAGMENT_PATH = resolve(tmpdir(), "avantiqo-secretary-manager.conf");

function clean(value, limit = 2000) {
  return String(value ?? "").trim().slice(0, limit);
}

function readEnvText() {
  return existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
}

function getEnvValue(text, key) {
  const pattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*=\\s*(.*)\\s*$`, "m");
  const match = text.match(pattern);
  if (!match) return "";
  const raw = clean(match[1], 10000);
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw;
}

function upsertEnvValue(text, key, value) {
  const safeValue = String(value).replace(/[\r\n]/g, "");
  const line = `${key}=${safeValue}`;
  const pattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*=.*$`, "m");
  if (pattern.test(text)) return text.replace(pattern, line);
  const prefix = text && !text.endsWith("\n") ? `${text}\n` : text;
  return `${prefix}${line}\n`;
}

function generatedToken() {
  return randomBytes(48).toString("base64url");
}

function dockerReachableBaseUrl(value) {
  const normalized = clean(value, 2000);
  if (!normalized) return DEFAULT_LOCAL_APP_URL;
  try {
    const url = new URL(normalized);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      url.hostname = "host.docker.internal";
      return url.toString().replace(/\/$/, "");
    }
  } catch {
    return normalized;
  }
  return normalized.replace(/\/$/, "");
}

function detectAsterisk() {
  const result = spawnSync("asterisk", ["-V"], { encoding: "utf8" });
  if (result.error?.code === "ENOENT") return { found: false, version: "" };
  if (result.status !== 0) return { found: false, version: clean(result.stderr || result.stdout, 500) };
  return { found: true, version: clean(result.stdout || result.stderr, 500) };
}

let envText = readEnvText();
const existingUsername = getEnvValue(envText, "ASTERISK_AMI_USERNAME");
const existingSecret = getEnvValue(envText, "ASTERISK_AMI_SECRET");
const existingGatewayToken = getEnvValue(envText, "AVANTIQO_SECRETARY_SIP_GATEWAY_TOKEN");
const existingIngressToken = getEnvValue(envText, "AVANTIQO_SECRETARY_CALL_GATEWAY_TOKEN");
const existingBaseUrl = getEnvValue(envText, "AVANTIQO_SECRETARY_PUBLIC_BASE_URL");
const username = existingUsername || DEFAULT_USERNAME;
const secret = existingSecret || randomBytes(32).toString("hex");
const gatewayToken = existingGatewayToken || generatedToken();
const ingressToken = existingIngressToken || generatedToken();
const baseUrl = dockerReachableBaseUrl(existingBaseUrl);

envText = upsertEnvValue(envText, "ASTERISK_AMI_USERNAME", username);
envText = upsertEnvValue(envText, "ASTERISK_AMI_SECRET", secret);
envText = upsertEnvValue(envText, "AVANTIQO_SECRETARY_SIP_GATEWAY_TOKEN", gatewayToken);
envText = upsertEnvValue(envText, "AVANTIQO_SECRETARY_CALL_GATEWAY_TOKEN", ingressToken);
envText = upsertEnvValue(envText, "AVANTIQO_SECRETARY_PUBLIC_BASE_URL", baseUrl);
writeFileSync(ENV_PATH, envText, { encoding: "utf8", mode: 0o600 });
try {
  chmodSync(ENV_PATH, 0o600);
} catch {
  // Best effort only on filesystems that support POSIX modes.
}

const managerFragment = `; Generated locally by Avantiqo Secretary. Contains a secret. DO NOT COMMIT.\n[${username}]\nsecret = ${secret}\ndeny = 0.0.0.0/0.0.0.0\npermit = 127.0.0.1/255.255.255.255\nread = system,call,log,verbose,command,agent,user,config,dtmf,reporting,cdr,dialplan\nwrite = system,call,command,agent,user,config,originate,reporting,dialplan\n`;
writeFileSync(MANAGER_FRAGMENT_PATH, managerFragment, { encoding: "utf8", mode: 0o600 });
try {
  chmodSync(MANAGER_FRAGMENT_PATH, 0o600);
} catch {
  // Best effort only on filesystems that support POSIX modes.
}

const asterisk = detectAsterisk();

console.log("SECRETARY_ASTERISK_LOCAL_BOOTSTRAP=PASS");
console.log(`SECRETARY_ASTERISK_AMI_USERNAME=${username}`);
console.log(`SECRETARY_ASTERISK_AMI_SECRET_CREATED=${existingSecret ? "false" : "true"}`);
console.log("SECRETARY_ASTERISK_AMI_SECRET_PRINTED=false");
console.log(`SECRETARY_GATEWAY_TOKEN_CREATED=${existingGatewayToken ? "false" : "true"}`);
console.log(`SECRETARY_CALL_GATEWAY_TOKEN_CREATED=${existingIngressToken ? "false" : "true"}`);
console.log("SECRETARY_GATEWAY_TOKENS_PRINTED=false");
console.log(`SECRETARY_GATEWAY_APP_BASE_URL_CONFIGURED=${Boolean(baseUrl)}`);
console.log("SECRETARY_GATEWAY_APP_BASE_URL_DOCKER_REACHABLE=true");
console.log(`SECRETARY_ASTERISK_ENV_PATH=${ENV_PATH}`);
console.log(`SECRETARY_ASTERISK_MANAGER_FRAGMENT=${MANAGER_FRAGMENT_PATH}`);
console.log(`SECRETARY_ASTERISK_LOCAL_BINARY=${asterisk.found ? "FOUND" : "MISSING"}`);
if (asterisk.found && asterisk.version) console.log(`SECRETARY_ASTERISK_VERSION=${asterisk.version}`);
console.log("SECRETARY_ASTERISK_MANAGER_CONFIG_APPLIED=false");
console.log("SECRETARY_ASTERISK_CARRIER_CALL_PERFORMED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
