import test from "node:test";
import assert from "node:assert/strict";

import { parseCodeAIWorkPackage } from "../lib/code/runtime/CodeAIWorkPackageCoreRuntime.js";

test("repairs exactly one extra object boundary between apply_files file entries", () => {
  const malformed = '{"contract":"AVANTIQO_CODE_AI_WORK_PACKAGE_V1","phase":"implementation","summary":"x","operations":[{"action":"apply_files","description":"x","input":{"files":[{"path":"a.js","content":"export const a = 1;"}},{"path":"b.js","content":"export const b = 2;"}]}},{"action":"verify","description":"verify","input":{"command":"node","args":["b.js"]}}]}';
  const parsed = parseCodeAIWorkPackage(malformed);
  assert.equal(parsed.operations[0].input.files.length, 2);
  assert.equal(parsed.operations[0].input.files[1].path, "b.js");
});

test("still rejects unrelated malformed JSON", () => {
  const malformed = '{"contract":"AVANTIQO_CODE_AI_WORK_PACKAGE_V1","operations":[BROKEN]}';
  assert.throws(() => parseCodeAIWorkPackage(malformed), /CODE_AI_WORK_PACKAGE_JSON_INVALID/);
});


test("repairs missing apply_files operation boundary before the next operation", () => {
  const malformed = '{"contract":"AVANTIQO_CODE_AI_WORK_PACKAGE_V1","phase":"implementation","summary":"x","operations":[{"action":"apply_files","description":"x","input":{"files":[{"path":"a.js","content":"export const a = 1;"}]},{"action":"verify","description":"verify","input":{"command":"node","args":["a.js"]}}]}';
  const parsed = parseCodeAIWorkPackage(malformed);
  assert.deepEqual(parsed.operations.map((operation) => operation.action).slice(0, 2), ["apply_files", "verify"]);
});


test("repairs one trailing extra brace only when the repaired package becomes valid JSON", () => {
  const malformed = '{"contract":"AVANTIQO_CODE_AI_WORK_PACKAGE_V1","phase":"implementation","summary":"x","operations":[{"action":"apply_files","description":"x","input":{"files":[{"path":"a.js","content":"export const a = 1;"}]}},{"action":"verify","description":"verify","input":{"command":"node","args":["a.js"]}}]}}';
  const parsed = parseCodeAIWorkPackage(malformed);
  assert.equal(parsed.operations[0].action, "apply_files");
});


test("repairs last file boundary directly before verify operation", () => {
  const malformed = '{"contract":"AVANTIQO_CODE_AI_WORK_PACKAGE_V1","phase":"implementation","summary":"x","operations":[{"action":"apply_files","description":"x","input":{"files":[{"path":"a.js","content":"export const a = 1;"}},{"action":"verify","description":"verify","input":{"command":"node","args":["a.js"]}}]}';
  const parsed = parseCodeAIWorkPackage(malformed);
  assert.equal(parsed.operations[0].action, "apply_files");
  assert.equal(parsed.operations[1].action, "verify");
});

test("repairs diff emitted as a property after verify into a diff operation", () => {
  const malformed = '{"contract":"AVANTIQO_CODE_AI_WORK_PACKAGE_V1","phase":"implementation","summary":"x","operations":[{"action":"apply_files","description":"x","input":{"files":[{"path":"a.js","content":"export const a = 1;"}]}},{"action":"verify","description":"verify","input":{"command":"node","args":["a.js"]}},"diff":{"description":"review diff","input":{}}]}';
  const parsed = parseCodeAIWorkPackage(malformed);
  assert.ok(parsed.operations.some((operation) => operation.action === "diff"));
});


test("repairs compact verification and diff tail after apply_files", () => {
  const malformed = '{"contract":"AVANTIQO_CODE_AI_WORK_PACKAGE_V1","phase":"implementation","summary":"x","operations":[{"action":"apply_files","description":"x","input":{"files":[{"path":"a.js","content":"export const a = 1;"}},{"path":"b.test.mjs","content":"ok"}],"verification":{"command":"node","args":["b.test.mjs"]},"diff":{}}';
  const parsed = parseCodeAIWorkPackage(malformed);
  assert.deepEqual(parsed.operations.map((op) => op.action), ["apply_files", "verify", "diff"]);
  assert.equal(parsed.operations[1].input.command, "node");
  assert.deepEqual(parsed.operations[1].input.args, ["b.test.mjs"]);
});


test("repairs compact single apply_files package missing input close brace", () => {
  const malformed = '{"contract":"AVANTIQO_CODE_AI_WORK_PACKAGE_V1","phase":"implementation","summary":"x","operations":[{"action":"apply_files","description":"x","input":{"files":[{"path":"b.test.mjs","content":"ok"}]}]}';
  const parsed = parseCodeAIWorkPackage(malformed, { authoritative_verification: { command: "node", args: ["b.test.mjs"] } });
  assert.deepEqual(parsed.operations.map((op) => op.action), ["apply_files", "verify", "diff"]);
  assert.equal(parsed.operations[0].input.files[0].path, "b.test.mjs");
});
