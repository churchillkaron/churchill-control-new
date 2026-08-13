import fs from "node:fs";
import path from "node:path";

// Registry-generated capabilities call internal APIs with the caller's cookie, so
// context.callerRequest must survive every hop from the route to execution. A
// single missing hop makes every generated read fail with "cannot be read without
// the caller request context" while the build stays green, which is exactly what
// happened once. This audit fails the build instead.
const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const HOPS = [
  ["turn route forwards the request", "app/api/operator/turn/route.js", /callerRequest:\s*request/],
  ["turn runtime accepts it", "lib/operator/runtime/OperatorTurnRuntime.js", /callerRequest = null/],
  ["turn runtime forwards it into runtime payload", "lib/operator/runtime/OperatorTurnRuntime.js", /callerRequest,\s*\n\s*metadata:/],
  ["execution engine spreads runtime into context", "lib/ubte/runtime/ExecutionEngine.js", /\.\.\.runtime/],
  ["execution context returns it", "lib/ubte/runtime/context/createExecutionContext.js", /^\s+callerRequest,$/m],
  ["registry bridge consumes it", "lib/platform/registry/operatorRegistryBridge.js", /context\?\.callerRequest/],
];

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

const turnRuntime = read("lib/operator/runtime/OperatorTurnRuntime.js");
const callSites = (turnRuntime.match(/await executeCapability\(\{/g) || []).length;
const forwarded = (turnRuntime.match(/callerRequest,\s*\n\s*\}\);/g) || []).length;

if (!callSites) broken.push("no executeCapability call sites found in OperatorTurnRuntime");
if (callSites !== forwarded) {
  broken.push(
    `only ${forwarded} of ${callSites} executeCapability call sites forward callerRequest`,
  );
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
