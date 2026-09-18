import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const forecast = read("lib/finance/budgeting/repositories/ForecastExceptionEscalationDeliveryRepository.js");
const sequences = read("app/api/finance/workspaces/number_sequences/route.js");
const generic = read("app/api/finance/workspaces/[capabilityId]/route.js");

test("forecast escalation delivery discovers every organization with unresolved cases", () => {
  const block = forecast.slice(forecast.indexOf("export async function listForecastExceptionDeliveryOrganizations"), forecast.indexOf("export async function syncForecastExceptionEscalationsForDelivery"));
  assert.match(block, /Forecast exception delivery organizations/);
  assert.match(block, /fetchCompleteFinancePopulation/);
  assert.match(block, /\.range\(from, to\)/);
  assert.doesNotMatch(block, /limit\(10000\)/);
});

test("number-sequence allocation lock checks exact runtime aliases instead of first 250 allocations", () => {
  const block = sequences.slice(sequences.indexOf("async function hasAllocatedNumbers"), sequences.indexOf("export async function GET"));
  assert.match(block, /Promise\.all\(aliases\.map/);
  assert.match(block, /\.ilike\("document_type", literal\)/);
  assert.match(block, /matches\.some\(Boolean\)/);
  assert.doesNotMatch(block, /limit\(250\)/);
});

test("number-sequence workspace reads complete scoped configuration population", () => {
  const block = sequences.slice(sequences.indexOf("export async function GET"), sequences.indexOf("export async function POST"));
  assert.match(block, /Finance number sequence workspace/);
  assert.match(block, /fetchCompleteFinancePopulation/);
  assert.match(block, /\.range\(from, to\)/);
  assert.doesNotMatch(block, /limit\(250\)/);
});

test("generic Finance workspaces no longer silently hide record 251", () => {
  const block = generic.slice(generic.indexOf("async function readTable"), generic.indexOf("function failureResponse"));
  assert.match(block, /fetchCompleteFinancePopulation/);
  assert.match(block, /Finance workspace \$\{table\}/);
  assert.match(block, /\.range\(from, to\)/);
  assert.doesNotMatch(block, /limit\(250\)/);
});
