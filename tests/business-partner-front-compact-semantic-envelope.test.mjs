import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../lib/operator/runtime/OperatorFrontCognitionRuntime.js", import.meta.url),
  "utf8",
);

test("front cognition accepts the current compact semantic classifier envelope without fast escalation", () => {
  assert.match(source, /request\.frontTaskMode === "semantic_classifier"/);
  assert.match(source, /chat\|inspect\|operate\|followup\|revise\|artifact\|unclear/);
  assert.match(source, /if \(compactSemanticEnvelope\) return front/);
});

test("legacy compact route envelope remains accepted during contract migration", () => {
  assert.match(source, /\\br\\s\*=\\s\*\[ceg\]/);
});
