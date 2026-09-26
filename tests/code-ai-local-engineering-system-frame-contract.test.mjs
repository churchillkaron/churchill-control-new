import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const provider = await readFile("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js", "utf8");

test("strong owned Code uses an evidence-first senior engineering system frame", () => {
  assert.match(provider, /const system=strongModelRequired\?STRONG_CODE_SYSTEM:FAST_CODE_SYSTEM/);
  assert.match(provider, /Work evidence-first/);
  assert.match(provider, /separate inference from required verification/);
  assert.match(provider, /Localize the root cause or mechanism/);
  assert.match(provider, /smallest safe change/);
  assert.match(provider, /tenant and authorization scope/);
  assert.match(provider, /Never broaden permissions or authority/);
  assert.match(provider, /failed, timed-out, or missing verification is not success/);
});

test("strong frame forbids false execution claims and chain-of-thought disclosure", () => {
  assert.match(provider, /Never claim a file, test, build, deployment, or tool action happened without execution evidence/);
  assert.match(provider, /Never reveal chain-of-thought; provide concise conclusions and evidence/);
  assert.match(provider, /raw_reasoning_persisted:false/);
});

test("fast Code keeps a compact bounded-task frame", () => {
  assert.match(provider, /FAST_CODE_SYSTEM="You are Avantiqo Code fast local execution/);
  assert.match(provider, /Solve bounded engineering tasks concisely and exactly/);
  assert.match(provider, /Preserve existing scope and the requested output format/);
});
