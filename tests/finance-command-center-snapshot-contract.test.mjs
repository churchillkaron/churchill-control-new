import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(
  new URL("../app/api/workspace/finance/command-center-snapshot/route.js", import.meta.url),
  "utf8",
);

test("database aggregate is the primary exact metric path", () => {
  assert.match(route, /\.rpc\("finance_command_center_metrics"/);
  assert.match(route, /metricsSourceMode = "database_aggregate"/);
  assert.match(route, /population: \{ complete: true, mode: "database_aggregate" \}/);
});

test("complete population fallback remains available", () => {
  assert.match(route, /fetchCompleteFinancePopulation/);
  assert.match(route, /metricsSourceMode = "complete_population_fallback"/);
  assert.match(route, /could not prove a complete/);
});

test("response metrics come from exact snapshot rather than bounded queue samples", () => {
  assert.match(route, /receivables: \{ \.\.\.snapshot\.metrics\.receivables/);
  assert.match(route, /approvals: \{ \.\.\.snapshot\.metrics\.approvals/);
  assert.match(route, /review: \{ \.\.\.snapshot\.metrics\.review/);
  assert.match(route, /active_clients: snapshot\.metrics\.practice\.active_clients/);
});

test("unproven accounting completeness is an error, not a zero snapshot", () => {
  assert.match(route, /status: 503/);
  assert.match(route, /Finance exact fallback could not prove/);
});
