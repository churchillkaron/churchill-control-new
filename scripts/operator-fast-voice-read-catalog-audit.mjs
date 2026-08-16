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
assert.match(reasoningSource, /if \(readChainHasFollowUp\(parsed\)\) return true/);
assert.match(
  reasoningSource,
  /unknownReadChainChildRequiresFallback:\s*true/,
);
assert.match(
  reasoningSource,
  /do not construct the follow_up on the fast spoken path/i,
);

console.log("OPERATOR_FAST_VOICE_READ_CATALOG_AUDIT=PASS");
console.log("OPERATOR_FAST_VOICE_PRIMARY_CAPABILITIES=12");
console.log("OPERATOR_FAST_VOICE_READ_SUPPLEMENT=6");
console.log("OPERATOR_FAST_VOICE_CAPABILITY_CEILING=18");
console.log("OPERATOR_FAST_VOICE_SUPPLEMENT_MODE=READ_ONLY");
console.log("OPERATOR_FAST_VOICE_MIXED_ACTION=FULL_REASONING_FALLBACK");
