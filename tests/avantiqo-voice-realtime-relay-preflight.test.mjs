import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const patcher = await readFile(
  new URL("../scripts/patch-avantiqo-voice-realtime-relay-config-local.mjs", import.meta.url),
  "utf8",
);

const preflight = await readFile(
  new URL("../scripts/preflight-avantiqo-voice-realtime-relay-local.mjs", import.meta.url),
  "utf8",
);

const supabaseConfig = await readFile(
  new URL("../supabase/config.toml", import.meta.url),
  "utf8",
);

test("Voice realtime relay config patcher is guarded and local-only", () => {
  assert.match(patcher, /AVANTIQO_VOICE_REALTIME_RELAY_CONFIG_PATCH_V1/);
  assert.match(patcher, /\[functions\.avantiqo-voice-realtime-relay\]/);
  assert.match(patcher, /verify_jwt = false/);
  assert.match(patcher, /EDGE_RUNTIME_MARKER_CHANGED/);
  assert.match(patcher, /CONFIG_SECTION_DUPLICATED/);
  assert.match(patcher, /production_deploy_performed:\s*false/);
  assert.match(patcher, /production_migration_applied:\s*false/);
  assert.match(patcher, /production_function_deployed:\s*false/);
  assert.doesNotMatch(patcher, /supabase\s+functions\s+deploy/i);
  assert.doesNotMatch(patcher, /vercel\s+(?:--prod|deploy|build)/i);
});

test("Voice realtime relay config is committed on main for manual WebSocket JWT auth", () => {
  const matches = supabaseConfig.match(/\[functions\.avantiqo-voice-realtime-relay\]/g) || [];
  assert.equal(matches.length, 1);
  const section = supabaseConfig.match(
    /\[functions\.avantiqo-voice-realtime-relay\][\s\S]*?(?=\n\[[^\n]+\]|$)/,
  )?.[0] || "";
  assert.match(section, /^verify_jwt\s*=\s*false\s*$/m);
});

test("Voice realtime relay preflight never prints secrets or performs network work", () => {
  assert.match(preflight, /AVANTIQO_VOICE_REALTIME_RELAY_PREFLIGHT_V1/);
  assert.match(preflight, /secret_presence/);
  assert.match(preflight, /secrets_printed:\s*false/);
  assert.match(preflight, /network_request_performed:\s*false/);
  assert.match(preflight, /gpu_started:\s*false/);
  assert.match(preflight, /generation_submitted:\s*false/);
  assert.match(preflight, /production_deploy_performed:\s*false/);
  assert.match(preflight, /production_function_deployed:\s*false/);
  assert.doesNotMatch(preflight, /fetch\s*\(/);
  assert.doesNotMatch(preflight, /https\.request|http\.request|WebSocket\s*\(/);
});

test("Voice realtime relay preflight checks exact secure release shape without activating it", () => {
  assert.match(preflight, /config_ready/);
  assert.match(preflight, /verify_jwt/);
  assert.match(preflight, /runpod_ws_url_shape_valid/);
  assert.match(preflight, /relay_secret_length_valid/);
  assert.match(preflight, /AVANTIQO_VOICE_REALTIME_RELAY_ENABLED/);
  assert.match(preflight, /AVANTIQO_VOICE_REALTIME_ENGINE_CERTIFIED/);
  assert.match(preflight, /AVANTIQO_VOICE_REALTIME_RELEASE_APPROVED/);
  assert.match(preflight, /realtime_streaming_certified:\s*false/);
  assert.match(preflight, /realtime_relay_deployed:\s*false/);
  assert.match(preflight, /realtime_relay_client_wired_to_operator:\s*false/);
});
