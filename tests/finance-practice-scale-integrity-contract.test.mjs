import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const helper = read("lib/finance/practice/FinancePracticePopulation.js");
const portal = read("app/api/workspace/finance/practice-client-portal/route.js");
const onboarding = read("app/api/workspace/finance/practice-onboarding/route.js");
const timeWip = read("app/api/workspace/finance/practice-time/route.js");
const control = read("app/api/workspace/finance/practice-control/route.js");

function getBlock(source) {
  return source.slice(source.indexOf("export async function GET"), source.indexOf("export async function POST"));
}

test("practice population helper paginates complete truth and batches large id sets", () => {
  assert.match(helper, /fetchCompleteFinancePopulation/);
  assert.match(helper, /chunkPracticeIds/);
  assert.match(helper, /loadCompletePracticeRowsByIds/);
  assert.match(helper, /buildQuery\(batch, from, to\)/);
});

test("Client access has no fixed engagement grant delivery or conversation cap", () => {
  const block = getBlock(portal);
  assert.match(block, /Accounting practice client-access engagements/);
  assert.match(block, /Accounting practice portal grants/);
  assert.match(block, /Accounting practice active portal messages/);
  assert.match(block, /Accounting practice portal deliveries/);
  assert.doesNotMatch(block, /limit\(1000\)|limit\(5000\)|limit\(10000\)/);
  assert.match(block, /\.eq\("sender_type", "CLIENT"\)[\s\S]*\.is\("read_by_firm_at", null\)/);
  assert.doesNotMatch(block, /unreadIds/);
});

test("Onboarding readiness covers every client engagement and controlled document", () => {
  const block = getBlock(onboarding);
  assert.match(block, /Accounting practice onboarding engagements/);
  assert.match(block, /Accounting practice controlled engagement documents/);
  assert.match(block, /Accounting practice engagement signatures/);
  assert.doesNotMatch(block, /limit\(1000\)/);
});

test("Time and WIP totals use complete firm-scoped clients work configuration and entries", () => {
  const block = getBlock(timeWip);
  assert.match(timeWip, /Accounting practice Time & WIP engagements/);
  assert.match(timeWip, /Accounting practice Time & WIP client organizations/);
  assert.match(timeWip, /Accounting practice open work items/);
  assert.match(block, /Accounting practice time entries/);
  assert.doesNotMatch(timeWip.slice(timeWip.indexOf("async function loadContext"), timeWip.indexOf("export async function POST")), /limit\(1000\)|limit\(5000\)|limit\(10000\)/);
  assert.doesNotMatch(timeWip, /from\("organizations"\)\.select\("id,name"\)\.limit/);
});

test("Practice Control client review run work and request metrics are complete beyond 500 clients", () => {
  const block = getBlock(control);
  for (const label of [
    "Accounting practice active client engagements",
    "Accounting practice control client organizations",
    "Accounting practice control review items",
    "Accounting practice control engagement runs",
    "Accounting practice control review notes",
    "Accounting practice control work items",
    "Accounting practice control client requests",
  ]) assert.match(block, new RegExp(label));
  assert.doesNotMatch(block, /limit\(500\)|limit\(5000\)|limit\(10000\)/);
});

const controlTower = read("components/workspace/finance/FinancePracticeControlTower.jsx");
const clientsPage = read("app/(system)/workspace/[organizationId]/finance/clients/page.jsx");

test("dedicated Clients route opens the complete portfolio instead of an empty attention filter", () => {
  assert.match(clientsPage, /initialView="clients"/);
  assert.match(controlTower, /initialView === "clients" \? "ALL" : "ATTENTION"/);
  assert.match(controlTower, /if \(clientFilter === "ATTENTION"\) return client\.status === "ATTENTION"/);
});
