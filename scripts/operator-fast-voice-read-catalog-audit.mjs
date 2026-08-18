import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const reasoningSource = await readFile(
  "lib/operator/runtime/OperatorReasoningRuntime.js",
  "utf8",
);

assert.match(
  reasoningSource,
  /const FAST_VOICE_PRIMARY_CAPABILITY_LIMIT = 12;/,
);
assert.match(
  reasoningSource,
  /const FAST_VOICE_READ_SUPPLEMENT_LIMIT = 6;/,
);
assert.match(
  reasoningSource,
  /FAST_VOICE_PRIMARY_CAPABILITY_LIMIT \+ FAST_VOICE_READ_SUPPLEMENT_LIMIT/,
);
assert.match(reasoningSource, /function fastVoiceCapabilities/);
assert.match(
  reasoningSource,
  /text\(item\?\.mode\)\.toLowerCase\(\) === "read"/,
);
assert.match(
  reasoningSource,
  /!selectedKeys\.has\(text\(item\?\.key\)\)/,
);
assert.match(
  reasoningSource,
  /return \[\.\.\.primary, \.\.\.supplementalReads\]\.slice\(0, FAST_VOICE_CAPABILITY_LIMIT\)/,
);
assert.match(
  reasoningSource,
  /const selected = voice\s*\? fastVoiceCapabilities\(capabilities, message\)\s*:\s*rankedCapabilities\(capabilities, message, 56\)/s,
);
assert.match(reasoningSource, /fast_voice_read_catalog_expansion:\s*true/);
assert.match(reasoningSource, /function fastVoiceFallbackReason/);
assert.match(reasoningSource, /return "invalid_response"/);
assert.match(
  reasoningSource,
  /return fastVoiceSafeClarification\(parsed\) \? null : "unsafe_clarification"/,
);
assert.match(reasoningSource, /return "full_catalog_requested"/);
assert.match(reasoningSource, /return "low_confidence"/);
assert.match(reasoningSource, /return "missing_capability"/);
assert.match(reasoningSource, /return "unknown_capability"/);
assert.match(reasoningSource, /return "non_read_requires_deep"/);
assert.match(reasoningSource, /return "read_chain_follow_up"/);
assert.match(reasoningSource, /return "entity_or_unknown_read_chain_scope"/);
assert.match(reasoningSource, /return "missing_navigation_target"/);
assert.match(reasoningSource, /return "unknown_navigation_target"/);
assert.match(reasoningSource, /fastVoiceFallbackReasonCode = "fast_execution_error"/);
assert.match(
  reasoningSource,
  /fast_voice_fallback_reason:\s*fastVoiceFallbackReasonCode/,
);
assert.match(
  reasoningSource,
  /unknownReadChainChildRequiresFallback:\s*true/,
);
assert.match(
  reasoningSource,
  /do not construct the follow_up on the fast path/i,
);
assert.match(
  reasoningSource,
  /routeOperatorCognition\(\{ message, source, capabilities \}\)/,
);
assert.match(
  reasoningSource,
  /const useFastVoice = cognition\.path !== "deep"/,
);
assert.doesNotMatch(
  reasoningSource,
  /fast_voice_fallback_reason:\s*(?:message|fastParsed|fastRequest|payload|user_input)/,
);

console.log("OPERATOR_FAST_VOICE_READ_CATALOG_AUDIT=PASS");
console.log("OPERATOR_FAST_VOICE_PRIMARY_CAPABILITIES=12");
console.log("OPERATOR_FAST_VOICE_READ_SUPPLEMENT=6");
console.log("OPERATOR_FAST_VOICE_CAPABILITY_CEILING=18");
console.log("OPERATOR_FAST_VOICE_SUPPLEMENT_MODE=READ_ONLY");
console.log("OPERATOR_FAST_EXECUTIVE_PATH=ALL_CHANNELS");
console.log("OPERATOR_FAST_EXECUTIVE_ACTIONS=DEEP_REASONING_FALLBACK");
console.log("OPERATOR_FAST_VOICE_FALLBACK_TELEMETRY=REASON_CODE_ONLY");
console.log("OPERATOR_FAST_VOICE_FALLBACK_PRIVACY=NO_USER_CONTENT_OR_PAYLOAD");
