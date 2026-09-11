import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime.js", import.meta.url),
  "utf8",
);

test("dynamic tribunal uses an isolated paid approval channel", () => {
  assert.match(source, /startsWith\("CREATIVE_DYNAMIC_TRIBUNAL_"\)/);
  assert.match(source, /key: "paid_tribunal_approval"/);
  assert.match(source, /CREATIVE_TRIBUNAL_BUDGET_APPROVAL_V1/);
  assert.match(source, /key: "paid_direction_approval"/);
  assert.match(source, /project\.metadata\?\.\[channel\.key\]/);
  assert.match(source, /\[channel\.key\]: \{/);
  assert.match(source, /channel\.metadataPrefix/);
});
