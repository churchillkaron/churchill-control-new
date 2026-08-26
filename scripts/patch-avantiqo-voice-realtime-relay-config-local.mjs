import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const CONTRACT = "AVANTIQO_VOICE_REALTIME_RELAY_CONFIG_PATCH_V1";
const ROOT = process.cwd();
const TARGET = path.join(ROOT, "supabase/config.toml");
const HEADER = "[functions.avantiqo-voice-realtime-relay]";
const DESIRED_BLOCK = `${HEADER}\nverify_jwt = false`;

function fail(code, details = {}) {
  console.error(JSON.stringify({
    success: false,
    contract: CONTRACT,
    error: code,
    ...details,
    gpu_started: false,
    generation_submitted: false,
    production_deploy_performed: false,
    production_migration_applied: false,
    production_function_deployed: false,
  }, null, 2));
  process.exit(1);
}

if (!fs.existsSync(TARGET)) {
  fail("AVANTIQO_VOICE_REALTIME_SUPABASE_CONFIG_MISSING");
}

let source = fs.readFileSync(TARGET, "utf8");
const headerMatches = source.match(/\[functions\.avantiqo-voice-realtime-relay\]/g) || [];
if (headerMatches.length > 1) {
  fail("AVANTIQO_VOICE_REALTIME_CONFIG_SECTION_DUPLICATED");
}

let changed = false;
if (headerMatches.length === 1) {
  const sectionPattern = /\[functions\.avantiqo-voice-realtime-relay\][\s\S]*?(?=\n\[[^\n]+\]|$)/;
  const match = source.match(sectionPattern);
  if (!match) {
    fail("AVANTIQO_VOICE_REALTIME_CONFIG_SECTION_UNREADABLE");
  }
  const block = match[0].trim();
  if (/^verify_jwt\s*=\s*false\s*$/m.test(block)) {
    changed = false;
  } else if (/^verify_jwt\s*=/m.test(block)) {
    source = source.replace(sectionPattern, `${DESIRED_BLOCK}\n`);
    changed = true;
  } else {
    source = source.replace(sectionPattern, `${block}\nverify_jwt = false\n`);
    changed = true;
  }
} else {
  const anchor = "[edge_runtime]";
  const first = source.indexOf(anchor);
  if (first === -1 || source.indexOf(anchor, first + anchor.length) !== -1) {
    fail("AVANTIQO_VOICE_REALTIME_EDGE_RUNTIME_MARKER_CHANGED");
  }
  source = `${source.slice(0, first)}${DESIRED_BLOCK}\n\n${source.slice(first)}`;
  changed = true;
}

const finalMatches = source.match(/\[functions\.avantiqo-voice-realtime-relay\]/g) || [];
if (finalMatches.length !== 1) {
  fail("AVANTIQO_VOICE_REALTIME_CONFIG_SECTION_INVALID_AFTER_PATCH");
}
const finalSection = source.match(/\[functions\.avantiqo-voice-realtime-relay\][\s\S]*?(?=\n\[[^\n]+\]|$)/)?.[0] || "";
if (!/^verify_jwt\s*=\s*false\s*$/m.test(finalSection)) {
  fail("AVANTIQO_VOICE_REALTIME_VERIFY_JWT_NOT_DISABLED");
}

if (changed) {
  fs.writeFileSync(TARGET, source, "utf8");
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  file: TARGET,
  changed,
  function: "avantiqo-voice-realtime-relay",
  verify_jwt: false,
  manual_websocket_jwt_validation_required: true,
  gpu_started: false,
  generation_submitted: false,
  production_deploy_performed: false,
  production_migration_applied: false,
  production_function_deployed: false,
}, null, 2));
