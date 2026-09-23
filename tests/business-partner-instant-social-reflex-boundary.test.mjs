import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("live Business Partner intercepts authenticated greeting before heavy turn pipeline", async () => {
  const source = await readFile("app/api/operator/turn/live/route.js", "utf8");
  const accessIndex = source.indexOf("requireOrganizationAccess({ organizationId, request })");
  const greetingIndex = source.indexOf("resolveOperatorInstantGreeting({");
  const delegateIndex = source.indexOf("runOperatorTurnPost(request, {");
  assert.ok(accessIndex >= 0);
  assert.ok(greetingIndex > accessIndex);
  assert.ok(delegateIndex > greetingIndex);
  assert.match(source, /state_unchanged: true/);
  assert.match(source, /project_context_loaded: false/);
  assert.match(source, /memory_loaded: false/);
  assert.match(source, /provider_request_performed: false/);
});

test("normal turn route intercepts greeting before business context and memory", async () => {
  const source = await readFile("app/api/operator/turn/route.js", "utf8");
  const greetingIndex = source.indexOf("const instantGreeting = resolveOperatorInstantGreeting({ message, source });");
  const contextIndex = source.indexOf("const contextStartedAt = Date.now();");
  const memoryIndex = source.indexOf("loadOrCreateIntelligenceConversation({");
  assert.ok(greetingIndex >= 0);
  assert.ok(contextIndex > greetingIndex);
  assert.ok(memoryIndex > contextIndex);
  assert.match(source, /state_unchanged: true/);
});

test("Business Partner UI preserves active state for social reflex turns", async () => {
  const home = await readFile("components/operator/HomeAvantiqoIntelligence.jsx", "utf8");
  const legacy = await readFile("components/operator/AvantiqoOperator.jsx", "utf8");
  assert.match(home, /if \(result\?\.state_unchanged !== true\)/);
  assert.match(legacy, /if \(result\?\.state_unchanged !== true\)/);
});
