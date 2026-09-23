import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("app/api/operator/attention/route.js", "utf8");
const home = fs.readFileSync("components/operator/HomeAvantiqoIntelligence.jsx", "utf8");

test("Business Partner page-load attention is a passive persisted snapshot", () => {
  assert.match(home, /fetch\("\/api\/operator\/attention"/);
  assert.match(home, /passiveSnapshot: true/);
  assert.match(route, /const passiveSnapshot =/);
  assert.match(route, /if \(passiveSnapshot\)/);
  assert.match(route, /attention_scan_performed: false/);
  assert.match(route, /thesis_synthesis_performed: false/);
  assert.match(route, /ai_calls_performed: 0/);
  assert.match(route, /state_mutation_performed: false/);
  assert.match(route, /loadIntelligenceConversationSnapshot/);
  assert.match(route, /loadOrganizationIntelligenceState/);
  assert.match(route, /organizationIntelligence\?\.state/);
});

test("passive attention returns before fresh scan, synthesis, and persistence", () => {
  const passive = route.indexOf("if (passiveSnapshot)");
  const snapshot = route.indexOf("loadIntelligenceConversationSnapshot({", passive);
  const create = route.indexOf("loadOrCreateIntelligenceConversation({", passive);
  const scan = route.indexOf("executeUbteCapability({");
  const synth = route.indexOf("synthesizeOperatorBusinessThesis({");
  const persist = route.indexOf("updateIntelligenceConversationState({");
  assert.ok(passive >= 0);
  assert.ok(snapshot > passive);
  assert.ok(create > snapshot);
  assert.ok(scan > create);
  assert.ok(synth > scan);
  assert.ok(persist > synth);
});
