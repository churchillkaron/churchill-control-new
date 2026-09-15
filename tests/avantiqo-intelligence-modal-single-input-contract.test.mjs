import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const worker = await readFile(new URL(
  "../services/avantiqo-intelligence-modal/modal_app.py",
  import.meta.url,
), "utf8");

test("Fast and Deep serialize GPU inputs per container", () => {
  const decorators = worker.match(/@modal\.concurrent\(max_inputs=1\)/g) || [];
  assert.equal(decorators.length, 2);
  assert.match(worker, /@modal\.concurrent\(max_inputs=1\)\ndef fast/);
  assert.match(worker, /@modal\.concurrent\(max_inputs=1\)\ndef deep/);
});

test("each Intelligence lane remains limited to one GPU container", () => {
  assert.match(worker, /def fast[\s\S]*?max_containers=1|max_containers=1[\s\S]*?def fast/);
  assert.match(worker, /def deep[\s\S]*?max_containers=1|max_containers=1[\s\S]*?def deep/);
});