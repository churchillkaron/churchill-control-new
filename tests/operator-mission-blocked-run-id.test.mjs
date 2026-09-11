import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile("lib/platform/capabilities/createOperatorMissionCapability.js", "utf8");

test("blocked Operator missions preserve the durable mission run id", () => {
  assert.match(source, /function blocked\(\{[\s\S]*runId = null[\s\S]*\}\) \{/);
  const calls = [...source.matchAll(/return blocked\(\{([\s\S]*?)\}\);/g)].map((match) => match[1]);
  assert.ok(calls.length >= 5);
  for (const call of calls) assert.match(call, /runId: missionRunId/);
  assert.match(source, /mission_state: resultState\(\{[\s\S]*runId,[\s\S]*\}\)/);
});
