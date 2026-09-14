import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../lib/operator/runtime/OperatorOrganizationalContextRuntime.js", import.meta.url),
  "utf8",
);

test("organizational history uses narrow JSON projections", () => {
  assert.match(source, /intent:decision->>intent/);
  assert.match(source, /capability_key:execution->capability->>key/);
  assert.match(source, /verification:evidence->verification/);
  assert.doesNotMatch(source, /select\("decision, evidence, execution, created_at"\)/);
});

test("organizational history preserves bounded continuity behavior", () => {
  assert.match(source, /\.limit\(24\)/);
  assert.match(source, /\.slice\(0, HISTORY_LIMIT\)/);
  assert.match(source, /return history\.slice\(0, 2\)/);
});
