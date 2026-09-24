import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function runtimeSources() {
  const dir = "lib/code/runtime";
  const files = (await readdir(dir)).filter((name) => /\.[cm]?js$/.test(name));
  return Promise.all(files.map(async (name) => ({
    name,
    source: await readFile(join(dir, name), "utf8"),
  })));
}

test("Code runtime never passes bounded text helper directly to Array.map", async () => {
  for (const file of await runtimeSources()) {
    assert.doesNotMatch(file.source, /\.map\(text\)/, file.name);
  }
});

test("mission text helper enforces the maximum lengths its callers request", async () => {
  const source = await readFile("lib/code/runtime/CodeAIMissionRuntime.js", "utf8");
  assert.match(source, /function text\(value, maximum = 4000\)/);
  assert.match(source, /\.trim\(\)\.slice\(0, maximum\)/);
  assert.match(source, /text\(operation\.action, 80\)/);
  assert.match(source, /text\(input\.file_path \|\| input\.path \|\| input\.files\?\.\[0\]\?\.path, 1000\)/);
});

test("reproduction status normalizes common model vocabulary and derives from evidence", async () => {
  const source = await readFile("lib/code/runtime/CodeAIMissionRuntime.js", "utf8");
  assert.match(source, /normalizeReproductionStatus/);
  assert.match(source, /"REPRODUCED".*"BROKEN"/);
  assert.match(source, /"FIXED".*"RESOLVED"/);
  assert.match(source, /deriveReproductionStatusFromEvidence/);
  assert.match(source, /const observedEvidenceStatus = deriveReproductionStatusFromEvidence\(state, evidenceOperationIds\)/);
  assert.match(source, /CODE_AI_REPRODUCTION_STATUS_EVIDENCE_MISMATCH/);
  assert.match(source, /CODE_AI_REPRODUCTION_EVIDENCE_REQUIRED/);
  assert.match(source, /\.map\(\(item\) => text\(item, 240\)\)/);
});
