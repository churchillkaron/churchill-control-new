import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Pest-only supervisor routes are solution gated", () => {
  const gate = read("components/workspace/operations/pest-control/PestControlSolutionGate.jsx");
  const corrective = read("app/(system)/workspace/[organizationId]/operations/field-service/corrective-control/layout.jsx");
  const exceptions = read("app/(system)/workspace/[organizationId]/operations/field-service/monitoring-exceptions/layout.jsx");

  assert.match(gate, /solutionId:\s*["']pest-control["']/);
  assert.match(gate, /operations\/work-orders/);
  assert.match(corrective, /PestControlSolutionGate/);
  assert.match(exceptions, /PestControlSolutionGate/);
});

test("legacy completion evidence detail route resolves to canonical Pest proof workspace", () => {
  const route = read("app/(system)/workspace/[organizationId]/operations/completion-evidence/[occurrenceId]/page.jsx");
  assert.match(route, /operations\/field-service\/evidence/);
  assert.match(route, /from=technician/);
  assert.match(route, /redirect\(/);
});
