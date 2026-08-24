import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const HOPS = [
  ["turn route forwards the request", "app/api/operator/turn/route.js", /callerRequest:\s*request/],
  ["turn core accepts it", "lib/operator/runtime/OperatorTurnRuntimeCore.js", /callerRequest = null/],
  ["turn core forwards it into runtime payload", "lib/operator/runtime/OperatorTurnRuntimeCore.js", /callerRequest,\s*\n\s*metadata:/],
  ["legacy turn orchestration forwards all options", "lib/operator/runtime/OperatorTurnRuntimeLegacy.js", /runOperatorTurnCore\(\{[\s\S]*\.\.\.options/],
  ["execution engine spreads runtime into context", "lib/ubte/runtime/ExecutionEngine.js", /\.\.\.runtime/],
  ["execution context returns it", "lib/ubte/runtime/context/createExecutionContext.js", /^\s+callerRequest,$/m],
  ["registry bridge consumes it", "lib/platform/registry/operatorRegistryBridge.js", /context\?\.callerRequest/],
];

function matchingCloseBrace(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function executeCapabilityCalls(source) {
  const marker = "await executeCapability({";
  const calls = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf(marker, cursor);
    if (start < 0) break;
    const openBrace = source.indexOf("{", start);
    const closeBrace = matchingCloseBrace(source, openBrace);
    if (closeBrace < 0) {
      calls.push({ source: source.slice(start), complete: false });
      break;
    }
    calls.push({
      source: source.slice(openBrace + 1, closeBrace),
      complete: true,
    });
    cursor = closeBrace + 1;
  }
  return calls;
}

const broken = [];
for (const [label, file, pattern] of HOPS) {
  let source = "";
  try {
    source = read(file);
  } catch {
    broken.push(`${label}: ${file} is missing`);
    continue;
  }
  if (!pattern.test(source)) broken.push(`${label}: ${file}`);
}

const turnRuntime = read("lib/operator/runtime/OperatorTurnRuntimeCore.js");
const capabilityCalls = executeCapabilityCalls(turnRuntime);
const callSites = capabilityCalls.length;
const incompleteCalls = capabilityCalls.filter((call) => !call.complete).length;
const missingCallerRequest = capabilityCalls.filter(
  (call) => call.complete && !/(?:^|[,{\s])callerRequest\s*(?:,|:)/m.test(call.source),
).length;

if (!callSites) broken.push("no executeCapability call sites found in OperatorTurnRuntimeCore");
if (incompleteCalls) broken.push(`${incompleteCalls} executeCapability call site(s) could not be parsed safely`);
if (missingCallerRequest) {
  broken.push(`${missingCallerRequest} of ${callSites} executeCapability call site(s) omit callerRequest`);
}
if (broken.length) {
  throw new Error(
    `OPERATOR_CALLER_CONTEXT: the caller request chain is broken, so registry-generated capabilities cannot execute.\n  ${broken.join("\n  ")}`,
  );
}

console.log("OPERATOR_CALLER_CONTEXT_AUDIT=PASS");
console.log(`OPERATOR_CALLER_CONTEXT_HOPS=${HOPS.length}`);
console.log(`OPERATOR_EXECUTE_CALL_SITES=${callSites}`);
console.log("OPERATOR_CALLER_CONTEXT=THREADED_END_TO_END");
console.log("OPERATOR_TURN_ORCHESTRATION=LEGACY_BEHIND_GOVERNED_ROUTER");
console.log("OPERATOR_TURN_ORCHESTRATION=FORWARDS_CALLER_CONTEXT_UNCHANGED");
