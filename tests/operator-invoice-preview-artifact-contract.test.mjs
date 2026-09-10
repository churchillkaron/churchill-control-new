import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(new URL("../app/api/finance/customer-invoices/route.js", import.meta.url), "utf8");
const bridge = fs.readFileSync(new URL("../lib/operator/runtime/OperatorIntelligenceToolBridgeRuntime.js", import.meta.url), "utf8");

test("customer invoice reads expose real invoice and paid receipt preview URLs", () => {
  assert.match(route, /preview_url: base/);
  assert.match(route, /pdf_url: base/);
  assert.match(route, /receipt_url: `\$\{base\}&mode=receipt`/);
  assert.match(route, /query = query\.eq\("entity_id", entityId\)/);
});

test("live read receipts preserve only sanitized presentation artifacts for chat", () => {
  assert.match(bridge, /presentationArtifacts/);
  assert.match(bridge, /presentation_artifacts: presentationArtifacts/);
  assert.match(bridge, /authorization_effect: "NONE"/);
  assert.match(bridge, /reference\.startsWith\("storage:\/\/"\)/);
  assert.match(bridge, /\^https\?:\\\/\\\//i);
});
