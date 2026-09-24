import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderRegistration.js", "utf8");
const session = fs.readFileSync("app/api/operator/transcribe/realtime/session/route.js", "utf8");
const settle = fs.readFileSync("app/api/operator/transcribe/realtime/settle/route.js", "utf8");
const config = fs.readFileSync("supabase/config.toml", "utf8");

test("realtime Voice remains explicitly uncertified and fail-closed", () => {
  assert.match(registration, /realtime_streaming_certified: false/);
  assert.match(session, /AVANTIQO_OWNED_REALTIME_STT_NOT_CERTIFIED/);
  assert.match(settle, /AVANTIQO_OWNED_REALTIME_STT_NOT_CERTIFIED/);
  assert.match(session, /status: 410/);
  assert.match(settle, /status: 410/);
});

test("retired realtime release preflight is not part of the release surface", () => {
  assert.equal(fs.existsSync("scripts/preflight-avantiqo-voice-realtime-relay-local.mjs"), false);
  assert.equal(fs.existsSync("supabase/functions/_shared/avantiqo-voice-realtime-safe-lease.ts"), false);
});

test("relay function stays configured without certifying the product feature", () => {
  const section = config.match(/\[functions\.avantiqo-voice-realtime-relay\][\s\S]*?(?=\n\[[^\n]+\]|$)/)?.[0] || "";
  assert.match(section, /^verify_jwt\s*=\s*false\s*$/m);
  assert.match(registration, /realtime_streaming:\s*false/);
});
