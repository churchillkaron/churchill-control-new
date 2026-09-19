import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const vatDependency = read("app/api/finance/vat-returns/dependency-client-request/route.js");
const health = read("app/api/finance/health/route.js");
const anomalies = read("app/api/finance/anomalies/route.js");

test("VAT dependency client-request selection reads the complete governed request population", () => {
  const block = vatDependency.slice(vatDependency.indexOf("async function listAuthenticRequests"), vatDependency.indexOf("async function loadEnvelope"));
  assert.match(block, /VAT dependency authentic client requests/);
  assert.match(block, /fetchCompleteFinancePopulation/);
  assert.match(block, /\.range\(from, to\)/);
  assert.doesNotMatch(block, /limit\(100\)/);
});

test("Finance Health evaluates every journal in organization scope", () => {
  assert.match(health, /Finance health journal population/);
  assert.match(health, /fetchCompleteFinancePopulation/);
  assert.match(health, /journalPopulation\.rows/);
  assert.doesNotMatch(health, /limit\(5000\)/);
});

test("Finance anomaly detection evaluates the complete journal population", () => {
  assert.match(anomalies, /Finance anomaly journal population/);
  assert.match(anomalies, /fetchCompleteFinancePopulation/);
  assert.match(anomalies, /journalPopulation\.rows/);
  assert.doesNotMatch(anomalies, /limit\(500\)/);
});
