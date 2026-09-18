import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const legal = read("lib/finance/legal-entities/LegalEntityPolicy.js");
const corrections = read("lib/finance/corrections/FinanceCorrectionRuntime.js");

test("legal entity uniqueness uses exact scoped indexed lookups instead of a bounded organization scan", () => {
  assert.match(legal, /findLegalEntityConflict/);
  assert.match(legal, /\.eq\("organization_id", organizationId\)/);
  assert.match(legal, /\.ilike\(field, escapeLikeLiteral\(value\)\)/);
  assert.match(legal, /Promise\.all/);
  const uniqueness = legal.slice(legal.indexOf("async function assertUniqueFields"), legal.indexOf("export async function validateLegalEntityWrite"));
  assert.doesNotMatch(uniqueness, /limit\(1000\)/);
  assert.doesNotMatch(uniqueness, /rows\.some/);
});

test("legal entity LIKE matching escapes wildcard characters before exact conflict lookup", () => {
  assert.match(legal, /function escapeLikeLiteral/);
  assert.match(legal, /replace\(\/%\/g/);
  assert.match(legal, /replace\(\/_\/g/);
});

test("correction duplicate preflight filters exact correction identity before limiting", () => {
  const duplicate = corrections.slice(corrections.indexOf("async function findOpenDuplicate"), corrections.indexOf("export async function listFinanceCorrections"));
  assert.match(duplicate, /\.contains\("metadata", \{ client_organization_id: clean\(clientOrganizationId\), exception: \{ account_id: clean\(accountId\) \} \}\)/);
  assert.match(duplicate, /\.limit\(1\)/);
  assert.match(duplicate, /\.maybeSingle\(\)/);
  assert.doesNotMatch(duplicate, /limit\(200\)/);
  assert.doesNotMatch(duplicate, /\.find\(/);
});

test("correction account selector reads the complete active chart of accounts", () => {
  const selector = corrections.slice(corrections.indexOf("export async function listCorrectionAccounts"), corrections.indexOf("export async function createFinanceCorrection"));
  assert.match(corrections, /fetchCompleteFinancePopulation/);
  assert.match(selector, /Finance correction account selector/);
  assert.match(selector, /\.range\(from, to\)/);
  assert.match(selector, /result\.rows/);
  assert.doesNotMatch(selector, /limit\(1000\)/);
});
