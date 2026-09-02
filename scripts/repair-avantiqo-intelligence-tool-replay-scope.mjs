import fs from "node:fs";

const CONTRACT = "AVANTIQO_INTELLIGENCE_TOOL_REPLAY_SCOPE_REPAIR_V1";
const path = "lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(before, after, code) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${CONTRACT}_${code}_EXPECTED_ONCE:${count}`);
  source = source.replace(before, after);
}

replaceOnce(
`import {
  resolveIntelligenceSettledOutputEnvelope,
} from "./AvantiqoIntelligenceOutputEnvelopeRuntime.mjs";
`,
`import {
  resolveIntelligenceSettledOutputEnvelope,
} from "./AvantiqoIntelligenceOutputEnvelopeRuntime.mjs";
import {
  assertNoDuplicateToolCallIdsWithinTurn,
} from "./AvantiqoToolCallReplayGuardRuntime.mjs";
`,
"IMPORT_BOUNDARY",
);

replaceOnce(
`  const seenCallIds = new Set();
`,
``,
"SESSION_GLOBAL_REPLAY_SET",
);

replaceOnce(
`    conversation.push(assistantToolCallMessage(calls));

    for (const call of calls) {
`,
`    assertNoDuplicateToolCallIdsWithinTurn(calls, turn);
    conversation.push(assistantToolCallMessage(calls));

    for (const call of calls) {
`,
"TURN_SCOPED_REPLAY_GUARD",
);

replaceOnce(
`      if (callId) {
        if (seenCallIds.has(callId)) {
          throw new Error(\`AVANTIQO_INTELLIGENCE_TOOL_CALL_REPLAY_DETECTED:\${callId}\`);
        }
        seenCallIds.add(callId);
      }

`,
``,
"SESSION_GLOBAL_REPLAY_CHECK",
);

if (/seenCallIds/.test(source)) {
  throw new Error(`${CONTRACT}_SESSION_GLOBAL_REPLAY_STATE_REMAINS`);
}
if (!/assertNoDuplicateToolCallIdsWithinTurn\(calls, turn\)/.test(source)) {
  throw new Error(`${CONTRACT}_TURN_SCOPED_GUARD_MISSING`);
}

fs.writeFileSync(path, source);
console.log(`${CONTRACT}=PASS`);
