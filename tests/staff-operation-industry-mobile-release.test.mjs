import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const navigation = fs.readFileSync(new URL("../lib/people/portal/StaffPortalNavigationRuntime.js", import.meta.url), "utf8");
const corrective = fs.readFileSync(new URL("../app/(system)/workspace/[organizationId]/operations/field-service/corrective-control/page.jsx", import.meta.url), "utf8");
const usage = fs.readFileSync(new URL("../app/(system)/workspace/[organizationId]/supply-chain/production/usage/page.jsx", import.meta.url), "utf8");
const logs = fs.readFileSync(new URL("../app/(system)/workspace/[organizationId]/supply-chain/production/logs/page.jsx", import.meta.url), "utf8");

test("role-specific operational surfaces stay inside their industry family", () => {
  assert.match(navigation, /key: "pos"[\s\S]*industries: \["restaurant", "bar", "nightclub", "food_beverage", "food-and-beverage", "retail", "shop", "store"\]/);
  assert.match(navigation, /key: "front-desk"[\s\S]*industries: \["hotel", "hospitality", "resort"\]/);
  assert.match(navigation, /key: "housekeeping"[\s\S]*industries: \["hotel", "hospitality", "resort"\]/);
  assert.match(navigation, /key: "field-service"[\s\S]*industries: \["pest_control", "pest-control", "field_service", "services"\]/);
});

test("industry modules default to matching industries but explicit tenant enablement still wins", () => {
  assert.match(navigation, /key: "restaurant"[\s\S]*industries: \["restaurant", "bar", "nightclub", "food_beverage", "food-and-beverage"\]/);
  assert.match(navigation, /key: "hotel"[\s\S]*industries: \["hotel", "hospitality", "resort"\]/);
  assert.match(navigation, /key: "pest-control"[\s\S]*industries: \["pest_control", "pest-control", "field_service", "services"\]/);
  assert.match(navigation, /key: "retail"[\s\S]*industries: \["retail", "shop", "store"\]/);
  assert.match(navigation, /key: "construction"[\s\S]*industries: \["construction", "contractor"\]/);
  assert.match(navigation, /if \(explicitAllow\.includes\(module\.key\)\) return true;[\s\S]*industryMatched/);
});

test("pest-control corrective control stacks on mobile and uses desktop columns only from md", () => {
  assert.match(corrective, /hidden[^"]*md:grid md:grid-cols-\[minmax\(0,1\.5fr\)_120px_160px_150px_190px\]/);
  assert.match(corrective, /grid gap-3 px-4 py-4 text-\[9px\] md:grid-cols-\[minmax\(0,1\.5fr\)_120px_160px_150px_190px\]/);
  assert.doesNotMatch(corrective, /className=\{`grid grid-cols-\[minmax\(0,1\.5fr\)_120px_160px_150px_190px\]/);
  assert.match(corrective, /md:hidden">Severity/);
  assert.match(corrective, /md:hidden">Next action/);
});

test("supply-chain production usage and logs use mobile cards instead of horizontally clipped tables", () => {
  assert.match(usage, /space-y-3 md:hidden/);
  assert.match(usage, /hidden overflow-hidden rounded-\[40px\] border border-white\/10 md:block/);
  assert.match(logs, /space-y-3 md:hidden/);
  assert.match(logs, /hidden overflow-hidden rounded-\[40px\] border border-white\/10 md:block/);
  assert.match(logs, /grid grid-cols-1 gap-3 p-4 sm:grid-cols-3/);
});
