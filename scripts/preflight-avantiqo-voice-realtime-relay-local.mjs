import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const CONTRACT = "AVANTIQO_VOICE_REALTIME_RELAY_PREFLIGHT_V1";
const ROOT = process.cwd();
const CONFIG = path.join(ROOT, "supabase/config.toml");
const RELAY = path.join(ROOT, "supabase/functions/avantiqo-voice-realtime-relay/index.ts");
const PATCHER = path.join(ROOT, "scripts/patch-avantiqo-voice-realtime-relay-config-local.mjs");

function text(value) {
  return String(value ?? "").trim();
}

function present(name) {
  return Boolean(text(process.env[name]));
}

function fail(code, details = {}) {
  console.error(JSON.stringify({
    success: false,
    contract: CONTRACT,
    error: code,
    ...details,
    secrets_printed: false,
    network_request_performed: false,
    gpu_started: false,
    generation_submitted: false,
    production_deploy_performed: false,
    production_migration_applied: false,
    production_function_deployed: false,
  }, null, 2));
  process.exit(1);
}

for (const [file, code] of [
  [CONFIG, "AVANTIQO_VOICE_REALTIME_SUPABASE_CONFIG_MISSING"],
  [RELAY, "AVANTIQO_VOICE_REALTIME_RELAY_SOURCE_MISSING"],
  [PATCHER, "AVANTIQO_VOICE_REALTIME_RELAY_CONFIG_PATCHER_MISSING"],
]) {
  if (!fs.existsSync(file)) fail(code);
}

const config = fs.readFileSync(CONFIG, "utf8");
const relay = fs.readFileSync(RELAY, "utf8");

const functionSection = config.match(/\[functions\.avantiqo-voice-realtime-relay\][\s\S]*?(?=\n\[[^\n]+\]|$)/)?.[0] || "";
const configReady = /^verify_jwt\s*=\s*false\s*$/m.test(functionSection);

const sourceChecks = {
  manual_auth_get_user: /admin\.auth\.getUser\(token\)/.test(relay),
  organization_membership: /from\("organization_users"\)/.test(relay),
  staff_membership: /from\("staff_accounts"\)/.test(relay),
  websocket_protocol_auth: /JWT_PROTOCOL_PREFIX = "jwt\."/.test(relay),
  runpod_httpscope: /url\.hostname\.endsWith\("\.api\.runpod\.ai"\)/.test(relay),
  exact_upstream_path: /url\.pathname === "\/v1\/realtime\/transcribe"/.test(relay),
  hmac_relay_auth: /name: "HMAC", hash: "SHA-256"/.test(relay),
  release_gate_enabled: /AVANTIQO_VOICE_REALTIME_RELAY_ENABLED/.test(relay),
  release_gate_engine: /AVANTIQO_VOICE_REALTIME_ENGINE_CERTIFIED/.test(relay),
  release_gate_approval: /AVANTIQO_VOICE_REALTIME_RELEASE_APPROVED/.test(relay),
  raw_audio_not_persisted: !/insert\([^)]*audio|update\([^)]*audio|storage\.from\(/i.test(relay),
};

const sourceReady = Object.values(sourceChecks).every(Boolean);
if (!sourceReady) {
  fail("AVANTIQO_VOICE_REALTIME_RELAY_SOURCE_PREFLIGHT_FAILED", { source_checks: sourceChecks });
}

const secretPresence = {
  supabase_url: present("SUPABASE_URL") || present("NEXT_PUBLIC_SUPABASE_URL"),
  supabase_secret: present("SUPABASE_SECRET_KEYS") || present("SUPABASE_SECRET_KEY") || present("SUPABASE_SERVICE_ROLE_KEY"),
  runpod_ws_url: present("AVANTIQO_VOICE_REALTIME_RUNPOD_WS_URL"),
  runpod_api_key: present("AVANTIQO_VOICE_REALTIME_RUNPOD_API_KEY"),
  relay_secret: present("AVANTIQO_VOICE_REALTIME_RELAY_SECRET"),
};

let runpodUrlShapeValid = null;
if (secretPresence.runpod_ws_url) {
  try {
    const url = new URL(text(process.env.AVANTIQO_VOICE_REALTIME_RUNPOD_WS_URL));
    runpodUrlShapeValid =
      url.protocol === "wss:" &&
      url.hostname.endsWith(".api.runpod.ai") &&
      url.pathname === "/v1/realtime/transcribe" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash;
  } catch {
    runpodUrlShapeValid = false;
  }
}

const relaySecretLengthValid = secretPresence.relay_secret
  ? text(process.env.AVANTIQO_VOICE_REALTIME_RELAY_SECRET).length >= 32
  : null;

const releaseGates = {
  relay_enabled: text(process.env.AVANTIQO_VOICE_REALTIME_RELAY_ENABLED).toLowerCase() === "true",
  engine_certified: text(process.env.AVANTIQO_VOICE_REALTIME_ENGINE_CERTIFIED).toLowerCase() === "true",
  release_approved: text(process.env.AVANTIQO_VOICE_REALTIME_RELEASE_APPROVED) === "YES",
};

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "LOCAL_SOFTWARE_PREFLIGHT",
  branch_required: "main",
  config_ready: configReady,
  config_patch_command: configReady
    ? null
    : "node scripts/patch-avantiqo-voice-realtime-relay-config-local.mjs",
  source_ready: sourceReady,
  source_checks: sourceChecks,
  secret_presence: secretPresence,
  runpod_ws_url_shape_valid: runpodUrlShapeValid,
  relay_secret_length_valid: relaySecretLengthValid,
  release_gates: releaseGates,
  release_ready: configReady &&
    sourceReady &&
    Object.values(secretPresence).every(Boolean) &&
    runpodUrlShapeValid === true &&
    relaySecretLengthValid === true &&
    Object.values(releaseGates).every(Boolean),
  expected_development_state: {
    realtime_streaming_certified: false,
    realtime_relay_deployed: false,
    realtime_relay_client_wired_to_operator: false,
  },
  secrets_printed: false,
  network_request_performed: false,
  gpu_started: false,
  generation_submitted: false,
  production_deploy_performed: false,
  production_migration_applied: false,
  production_function_deployed: false,
}, null, 2));
