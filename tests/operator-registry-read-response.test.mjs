import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const source = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");

test("registry record read renderer is deterministic and does not require AI synthesis", () => {
  assert.match(source, /export function normalizeRegistryReadEvidence/);
  assert.match(source, /export function registryRecordReadResponseText/);
  assert.match(source, /No \$\{evidence\.label\.toLowerCase\(\)\} were found for the current business context/);
  assert.match(source, /current record\$\{evidence\.count === 1 \? "" : "s"\}/);
  assert.match(source, /if \(evidence\.type === "metric"\)/);
  assert.match(source, /if \(evidence\.type === "state"\)/);
  assert.match(source, /if \(evidence\.type === "blocker"\) return evidence\.message/);
});

test("registry record rendering keeps bounded customer-facing fields and hides authority metadata", () => {
  assert.match(source, /evidence\.rows\.slice\(0, 8\)/);
  assert.match(source, /\["id", "organization_id", "entity_id", "created_by", "updated_by"\]/);
  assert.match(source, /\["authorization", "capability", "source", "rows_key"\]/);
});
