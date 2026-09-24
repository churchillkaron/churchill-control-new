import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../lib/code/runtime/CodeAIMissionRuntime.js", import.meta.url),
  "utf8",
);

test("missing precision_analyze kind is inferred safely", () => {
  assert.match(source, /const explicitKind = text\(operation\.input\?\.kind\)\.toLowerCase\(\)/);
  assert.match(source, /const inferredKind = normalizedExplicitKind \|\|/);
  assert.match(source, /\? "coverage_guidance"/);
  assert.match(source, /\? "property_fuzz"/);
  assert.match(source, /: "uncertainty"\s*\)/);
});

test("descriptive restart recovery labels normalize to failure injection", () => {
  assert.match(source, /restart\|recovery\|resilien\|failure\|timeout\|disconnect\|unavailable\|outage/);
  assert.match(source, /\? "failure_injection"/);
});

test("descriptive verification labels normalize to uncertainty", () => {
  assert.match(source, /uncertain\|confidence\|evidence\|verification\|verify\|analysis\|check/);
  assert.match(source, /explicitKind\.includes\(" "\)\s*\? "uncertainty"/);
});

test("unknown machine-style precision kinds still fail closed", () => {
  assert.match(source, /CODE_AI_PRECISION_ANALYZE_KIND_UNSUPPORTED:\$\{kind\}/);
});
