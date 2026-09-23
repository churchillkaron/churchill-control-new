import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const local = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalRuntime.js", "utf8");
const queue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js", "utf8");
const reasoning = fs.readFileSync("lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js", "utf8");

test("owned Intelligence enforces JSON output through the local runtime only when requested", () => {
  assert.match(local, /response_format \|\| input\.responseFormat/);
  assert.match(local, /type === "json_object" \? \{ format: "json" \} : \{\}/);
  assert.match(queue, /response_format: \(input\.response_format \|\| input\.responseFormat\)\?\.type === "json_object" \? \{ type: "json_object" \} : null/);
  assert.doesNotMatch(local, /Modal|modal|RunPod|runpod/);
});

test("local structured-output usage remains included in governed token accounting", () => {
  assert.match(local, /input_tokens: Number\(raw\?\.prompt_eval_count \|\| 0\)/);
  assert.match(local, /output_tokens: Number\(raw\?\.eval_count \|\| 0\)/);
  assert.match(reasoning, /totalInputTokens \+= Number\(output\?\.usage\?\.input_tokens \|\| execution\?\.usage\?\.input_tokens \|\| 0\)/);
  assert.match(reasoning, /totalOutputTokens \+= Number\(output\?\.usage\?\.output_tokens \|\| execution\?\.usage\?\.output_tokens \|\| 0\)/);
  assert.match(reasoning, /usage: \{[\s\S]*input_tokens: totalInputTokens,[\s\S]*output_tokens: totalOutputTokens/);
});
