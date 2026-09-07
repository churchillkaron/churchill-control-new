import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("monitoring register preserves supervisor return context", () => {
  const register = read("components/workspace/operations/pest-control/PestControlMonitoringRounds.jsx");
  const detail = read("components/workspace/operations/pest-control/PestControlVisitMonitoringRound.jsx");

  assert.match(register, /monitoring-round\/\$\{encodeURIComponent\(row\.occurrence_id\)\}\?from=rounds/);
  assert.match(detail, /get\("from"\) === "rounds"/);
  assert.match(detail, /const roundsHref = .*operations\/field-service\/monitoring-rounds/);
  assert.match(detail, /const returnHref = returnContext === "rounds" \? roundsHref : technicianHref/);
  assert.match(detail, /occurrenceId=\$\{encodeURIComponent\(occurrenceId\)\}/);
});

test("corrective service uses canonical Pest Work Control route", () => {
  const corrective = read("app/(system)/workspace/[organizationId]/operations/field-service/corrective-control/page.jsx");

  assert.match(corrective, /operations\/field-service\/work-control\?workOrderId=/);
  assert.doesNotMatch(corrective, /operations\/work-control\?workOrderId=/);
});
