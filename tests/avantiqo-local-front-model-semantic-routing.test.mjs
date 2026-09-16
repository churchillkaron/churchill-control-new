import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const queue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js", "utf8");
const direct = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalRuntime.js", "utf8");
const modal = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceModalDirectRuntime.js", "utf8");

test("conversation_light preserves the accepted 1.7B front lane instead of being forced onto local 4B", () => {
  assert.match(queue, /frontTaskMode === "conversation_light"\) return false/);
  assert.match(direct, /frontTaskMode === "conversation_light"\) return false/);
  assert.match(modal, /frontTaskMode\)\.toLowerCase\(\) === "conversation_light" \? FRONT_LIGHT_MODEL : FRONT_MODEL/);
});

test("semantic and normal front modes remain eligible for owned local 4B", () => {
  assert.match(queue, /if \(value === "front"\) return list\(input\.tools\)\.length === 0/);
  assert.match(direct, /if \(lane === "front"\) return true/);
});
