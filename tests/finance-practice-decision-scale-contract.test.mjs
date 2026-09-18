import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const capacity = read("app/api/workspace/finance/practice-capacity/route.js");
const billing = read("app/api/workspace/finance/practice-billing/route.js");
const programs = read("app/api/workspace/finance/work-programs/route.js");
const engagementFile = read("app/api/workspace/finance/engagement-file/route.js");

test("practice capacity forecast reads the complete open-work population", () => {
  assert.match(capacity, /Accounting practice capacity open work/);
  assert.match(capacity, /loadCompletePracticeRows/);
  const block = capacity.slice(capacity.indexOf("export async function GET"));
  assert.doesNotMatch(block, /limit\(10000\)/);
});

test("practice billing invoice amount and idempotency bind every approved billable time entry", () => {
  assert.match(billing, /Accounting practice approved billable time/);
  assert.match(billing, /loadCompletePracticeRows/);
  assert.match(billing, /const entryIds = rows\.map/);
  assert.doesNotMatch(billing, /limit\(10000\)/);
});

test("work-program runtime loads complete runs items and client requests", () => {
  const block = programs.slice(programs.indexOf("export async function GET"), programs.indexOf("export async function POST"));
  assert.match(block, /Accounting practice work-program runs/);
  assert.match(block, /Accounting practice work-program items/);
  assert.match(block, /Accounting practice work-program client requests/);
  assert.match(block, /loadCompletePracticeRowsByIds/);
  assert.doesNotMatch(block, /limit\(500\)/);
});

test("engagement file review truth has no fixed run review document note or signoff cap", () => {
  const block = engagementFile.slice(engagementFile.indexOf("export async function GET"));
  for (const label of [
    "Engagement file runs",
    "Engagement file review items",
    "Engagement file documents",
    "Engagement file work items",
    "Engagement file client requests",
    "Engagement file review notes",
    "Engagement file review signoffs",
    "Engagement file evidence links",
  ]) assert.match(block, new RegExp(label));
  assert.doesNotMatch(block, /limit\(36\)|limit\(200\)|limit\(500\)|limit\(1000\)/);
});
