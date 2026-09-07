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
  const reports = read("app/(system)/workspace/[organizationId]/operations/field-service/service-reports/layout.jsx");

  assert.match(gate, /solutionId:\s*["']pest-control["']/);
  assert.match(gate, /operations\/work-orders/);
  assert.match(corrective, /PestControlSolutionGate/);
  assert.match(exceptions, /PestControlSolutionGate/);
  assert.match(reports, /PestControlSolutionGate/);
});

test("legacy completion evidence detail route resolves to canonical Pest proof workspace", () => {
  const route = read("app/(system)/workspace/[organizationId]/operations/completion-evidence/[occurrenceId]/page.jsx");
  assert.match(route, /operations\/field-service\/evidence/);
  assert.match(route, /from=technician/);
  assert.match(route, /redirect\(/);
});

test("Completion Evidence preserves supervisor and technician return context", () => {
  const hub = read("components/workspace/operations/pest-control/PestControlEvidenceHub.jsx");
  const route = read("app/(system)/workspace/[organizationId]/operations/field-service/evidence/[occurrenceId]/page.jsx");

  assert.match(hub, /from=proof-queue/);
  assert.match(route, /useSearchParams\(\)/);
  assert.match(route, /source === "technician" \? technicianHref : proofQueueHref/);
  assert.match(route, /Return to technician visit/);
  assert.match(route, /Return to proof queue/);
  assert.match(route, /occurrenceId=/);
  assert.match(route, /<Suspense/);
});

test("visit-bound monitoring search params remain behind a Suspense boundary", () => {
  const route = read("app/(system)/workspace/[organizationId]/operations/field-service/monitoring-points/visit-scan/page.jsx");
  assert.match(route, /import\s*\{[^}]*Suspense[^}]*\}\s*from\s*["']react["']/s);
  assert.match(route, /<Suspense[\s\S]*<VisitMonitoringScannerRoute\s*\/>[\s\S]*<\/Suspense>/);
  assert.match(route, /const\s+searchParams\s*=\s*useSearchParams\(\)/);
});
