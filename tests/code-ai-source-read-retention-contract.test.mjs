import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mission = await readFile(new URL("../lib/code/runtime/CodeAIMissionRuntime.js", import.meta.url), "utf8");

test("completed source reads survive rolling mission evidence compaction", () => {
  assert.match(mission, /MAX_SOURCE_READ_EVIDENCE = 8/);
  assert.match(mission, /source_read_evidence: list\(prior\.source_read_evidence\)\.slice\(-MAX_SOURCE_READ_EVIDENCE\)/);
  assert.match(mission, /if \(operation\.action === "read"\) \{/);
  assert.match(mission, /state\.source_read_evidence = \[/);
  assert.match(mission, /result: bounded\(result\)/);
  assert.match(mission, /\.slice\(-MAX_SOURCE_READ_EVIDENCE\)/);
});
