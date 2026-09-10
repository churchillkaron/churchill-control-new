import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source = await readFile("scripts/derive-avantiqo-code-competitive-backlog.mjs", "utf8");
test("competitive losses become bounded engineering improvement evidence", () => {
  assert.match(source, /AVANTIQO_CODE_COMPETITIVE_IMPROVEMENT_BACKLOG_V1/);
  assert.match(source, /result\.outcome !== "LOSS"/);
  assert.match(source, /required_evidence/);
  assert.match(source, /next_focus/);
});
test("competitive feedback cannot authorize persistence or deployment", () => {
  assert.match(source, /authorization_effect: "NONE"/);
  assert.match(source, /automatic_commit_allowed: false/);
  assert.match(source, /production_deploy_allowed: false/);
});
