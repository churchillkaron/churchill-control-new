import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const shell = await readFile(new URL("../components/creative/code/CreativeCodeStudio.jsx", import.meta.url), "utf8");
const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");

test("only Talk/IDE owns Code mission submission", () => {
  assert.doesNotMatch(shell, /fetch\("\/api\/operator\/code\/mission"/);
  assert.match(ide, /fetch\("\/api\/operator\/code\/mission"/);
});

test("legacy mission panel hands instructions to Talk instead of executing", () => {
  assert.match(shell, /CODE_TALK_PREFILL_EVENT = "avantiqo:code-talk-prefill"/);
  assert.match(shell, /window\.dispatchEvent\(new CustomEvent\(CODE_TALK_PREFILL_EVENT/);
  assert.match(shell, /Send to Talk/);
  assert.match(ide, /window\.addEventListener\("avantiqo:code-talk-prefill", acceptTalkPrefill\)/);
  assert.match(ide, /setObjective\(nextObjective\)/);
});
