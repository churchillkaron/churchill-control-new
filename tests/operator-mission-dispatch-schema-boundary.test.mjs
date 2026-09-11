import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../lib/operator/runtime/OperatorMissionDispatchRuntime.js", import.meta.url),
  "utf8",
);

test("mission dispatch fails with a stable governed schema prerequisite", () => {
  assert.match(source, /OPERATOR_MISSION_DISPATCH_SCHEMA_REQUIRED/);
  assert.match(source, /20260902053633_operator_mission_dispatch_journal\.sql/);
  assert.match(source, /automatic_migration_performed: false/);
  assert.match(source, /authorization_effect: "NONE"/);
  assert.match(source, /\["42P01", "PGRST205"\]/);
});

test("dispatch schema errors are normalized on claim, load, update and verify", () => {
  const matches = source.match(/throwDispatchError\(/g) || [];
  assert.ok(matches.length >= 4, `expected at least four normalized dispatch error boundaries, got ${matches.length}`);
});
