import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../lib/operator/runtime/OperatorTurnRuntime.js", import.meta.url),
  "utf8",
);

test("Operator degrades exact unavailable owned Deep failures to owned Fast", () => {
  assert.match(
    source,
    /No priced executable provider available for ai\\\.reasoning\\\.execute/,
  );
  assert.match(source, /runFastConversationTurn/);
  assert.match(source, /OPERATOR_OWNED_DEEP_FAST_DEGRADATION/);
  assert.match(source, /DEEP_PROVIDER_UNAVAILABLE/);
  assert.match(source, /from_lane:\s*"deep"/);
  assert.match(source, /to_lane:\s*"fast"/);
});

test("Deep degradation remains owned-only and mutation-free", () => {
  assert.match(source, /external_fallback_used:\s*false/);
  assert.match(source, /owned_provider_only:\s*true/);
  assert.match(source, /mutation_execution_allowed:\s*false/);
  assert.match(source, /degraded_mutation_execution_allowed:\s*false/);
  assert.match(source, /stagedMutationRequiresCognitiveBlock\(degraded, guard\)/);
});

test("Fast failure still falls through to safe provider-unavailable handling", () => {
  assert.match(source, /OPERATOR_OWNED_DEEP_FAST_DEGRADATION_FAILED/);
  assert.match(
    source,
    /shouldSanitizeOperatorRuntimeError\(fastError\)/,
  );
  assert.match(
    source,
    /providerRuntimeBlockedTurn\(effectiveOptions, fastError\)/,
  );
});
