import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url), "utf8");

test("tribunal distinguishes internal illustrative UI from external factual claims", () => {
  assert.match(source, /generic internal label such as a current-quarter cash-flow screen is not, by itself, a claim that a published third-party financial report exists/);
  assert.match(source, /Do not invent an external-source claim and then fail the plan for lacking that invented source/);
  assert.match(source, /Require verification only for real figures, named entities, published sources, regulated facts or other externally checkable claims/);
});
