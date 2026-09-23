import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/operator/runtime/IntelligenceConversationRuntime.js", "utf8");

test("superseded assistant and its exact paired user turn are excluded from reusable model context", () => {
  assert.match(source, /function reusableConversationRows\(rows = \[\]\)/);
  assert.match(source, /object\(row\?\.decision\)\.superseded_live_execution === true/);
  assert.match(source, /object\(row\?\.decision\)\.paired_user_turn_id/);
  assert.match(source, /!supersededAssistantIds\.has\(text\(row\?\.id\)\)/);
  assert.match(source, /!supersededUserIds\.has\(text\(row\?\.id\)\)/);
});

test("recent conversation loader fetches decision metadata and filters before diagnosis sanitization", () => {
  assert.match(source, /select\("id,role,content,decision,evidence,created_at"\)/);
  const filter = source.indexOf("const reusableRows = reusableConversationRows(turns.data || [])");
  const sanitize = source.indexOf("sanitizeBusinessDiagnosisConversation(reusableRows", filter);
  assert.ok(filter >= 0);
  assert.ok(sanitize > filter);
});

test("snapshot history remains unfiltered for audit visibility", () => {
  assert.match(source, /const visibleTurns = \(turns\.data \|\| \[\]\)\.slice\(\)\.reverse\(\)/);
  assert.doesNotMatch(source, /const visibleTurns = reusableConversationRows/);
});
