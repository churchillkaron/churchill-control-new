import test from "node:test";
import assert from "node:assert/strict";
import { parseCodeAIPlannerOutput } from "../lib/code/runtime/CodeAIPlannerDecisionParser.js";

test("one trailing brace is normalized for evidence-only hypothesis output", () => {
  const raw = '{"action":"record_hypotheses","input":{"hypotheses":[{"id":"H1","hypothesis":"cause one","status":"PLAUSIBLE","evidence_operation_ids":["op1"]},{"id":"H2","hypothesis":"cause two","status":"PLAUSIBLE","evidence_operation_ids":["op1"]},{"id":"H3","hypothesis":"cause three","status":"PLAUSIBLE","evidence_operation_ids":["op1"]}]}}}';
  const parsed = parseCodeAIPlannerOutput(raw);
  assert.equal(parsed.parsed.action, "record_hypotheses");
  assert.equal(parsed.normalization.mode, "single_guarded_trailing_brace_over_emission");
  assert.equal(parsed.normalization.discarded_trailing_brace_count, 1);
});

test("one stray quote before the final brace is normalized for evidence-only output", () => {
  const raw = '{"action":"record_hypotheses","input":{"hypotheses":[{"id":"H1","hypothesis":"cause one","status":"PLAUSIBLE","evidence_operation_ids":["op1"]},{"id":"H2","hypothesis":"cause two","status":"PLAUSIBLE","evidence_operation_ids":["op1"]},{"id":"H3","hypothesis":"cause three","status":"PLAUSIBLE","evidence_operation_ids":[]}]}" }'.replace('" }', '"}');
  const parsed = parseCodeAIPlannerOutput(raw);
  assert.equal(parsed.parsed.action, "record_hypotheses");
  assert.equal(parsed.normalization.mode, "single_guarded_trailing_quote_before_brace_over_emission");
  assert.equal(parsed.normalization.discarded_trailing_quote_count, 1);
});

test("malformed mutating output still fails closed", () => {
  assert.throws(
    () => parseCodeAIPlannerOutput('{"action":"apply_files","input":{"files":[]}}}'),
    /CODE_AI_AUTONOMOUS_PLANNER_JSON_INVALID/,
  );
  assert.throws(
    () => parseCodeAIPlannerOutput('{"action":"apply_files","input":{"files":[]}" }'.replace('" }', '"}')),
    /CODE_AI_AUTONOMOUS_PLANNER_JSON_INVALID/,
  );
});


test("evidence-only first object can discard malformed read-only trailing action", () => {
  const raw = '{"action":"record_hypotheses","input":{"hypotheses":[{"id":"H1","hypothesis":"a","status":"PLAUSIBLE","evidence_operation_ids":[]},{"id":"H2","hypothesis":"b","status":"PLAUSIBLE","evidence_operation_ids":[]},{"id":"H3","hypothesis":"c","status":"PLAUSIBLE","evidence_operation_ids":[]}]}}' +
    ',{"action":"read","input":{"file_path":"tests/example.mjs"}}]}}';
  const parsed = parseCodeAIPlannerOutput(raw);
  assert.equal(parsed.parsed.action, "record_hypotheses");
  assert.equal(parsed.normalization.mode, "evidence_first_with_read_only_trailing_junk");
  assert.deepEqual(parsed.normalization.discarded_actions, ["read"]);
});

test("evidence-first recovery refuses trailing mutation actions", () => {
  const raw = '{"action":"record_hypotheses","input":{"hypotheses":[{"id":"H1","hypothesis":"a","status":"PLAUSIBLE","evidence_operation_ids":[]},{"id":"H2","hypothesis":"b","status":"PLAUSIBLE","evidence_operation_ids":[]},{"id":"H3","hypothesis":"c","status":"PLAUSIBLE","evidence_operation_ids":[]}]}}' +
    ',{"action":"apply_files","input":{"files":[{"path":"x","content":"y"}]}}]}}';
  assert.throws(
    () => parseCodeAIPlannerOutput(raw),
    /CODE_AI_AUTONOMOUS_PLANNER/,
  );
});
