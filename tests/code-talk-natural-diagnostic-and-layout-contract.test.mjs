import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");
const conversation = await readFile(new URL("../lib/code/runtime/CodeAIConversationRuntime.js", import.meta.url), "utf8");

test("natural product diagnostics route to repository work without technical keywords", () => {
  assert.match(ide, /const diagnosticRequest = \/\\b\(\?:check\|diagnose\|investigate/);
  assert.match(ide, /diagnosticRequest \|\|/);
  assert.match(conversation, /diagnosticRequest \|\|/);
  assert.match(conversation, /Requests diagnosis of a live product problem/);
});

test("diagnostic mission objective reproduces before editing", () => {
  assert.match(ide, /Diagnose the user's reported product problem before making any source change/);
  assert.match(ide, /Do not treat the user's wording as a filename or invent an implementation target/);
  assert.match(ide, /Reproduce or inspect the real user-facing failure first/);
  assert.match(ide, /Only then repair proven defects/);
});

test("Talk user messages are visually separated on the right", () => {
  assert.match(ide, /ml-auto mr-3 w-fit min-w-0 max-w-\[min\(68%,760px\)\] overflow-hidden break-words rounded-2xl rounded-br-md/);
  assert.match(ide, /bg-\[#D6A66A\]\/\[0\.12\]/);
  assert.match(ide, />You<\/div>/);
  assert.match(ide, /mr-auto min-w-0 max-w-\[86%\] break-words/);
});

test("old live setup narration is not kept in permanent Talk history", () => {
  assert.match(ide, /i’m building the engineering controls for this task/);
  assert.match(ide, /the engineering controls are ready/);
  assert.match(ide, /the precision controls are ready/);
  assert.match(ide, /i’m selecting the local code execution transport/);
  assert.match(ide, /i’m starting the local code employee/);
});
