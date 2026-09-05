import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const policy = read("lib/finance/tax/FinanceTaxCloseIntelligencePolicy.js");
const route = read("app/api/finance/vat-returns/close-intelligence/route.js");
const rail = read("components/workspace/finance/FinanceTaxCloseIntelligenceRail.jsx");
const wrapper = read("components/workspace/finance/FinanceTaxWorkCenter.jsx");

test("Tax close intelligence is built only after exact live governed Tax evidence", () => {
  assert.match(route, /buildFinanceVatReturnPreflight\(\{ organizationId, entityId, vatReturnId \}\)/);
  assert.match(route, /applyFinanceTaxCalendarToPreflight\(raw\)/);
  assert.match(route, /applyFinanceVatCalculationMethodToPreflight\(calendar\)/);
  assert.match(route, /deriveFinanceTaxCloseGuidance\(current\)/);
  assert.match(route, /current\.return\.id !== vatReturnId/);
  assert.match(policy, /createHash\("sha256"\)/);
  assert.match(policy, /source_fingerprint: fingerprint\(evidence\)/);
  assert.match(policy, /resolution_authority: FINANCE_TAX_CLOSE_RESOLUTION_AUTHORITY/);
});

test("Owned Tax intelligence runs read-only and carries no execution authority", () => {
  assert.match(route, /runStructuredIntelligenceSupervisor/);
  assert.match(route, /operation: "FINANCE_TAX_CLOSE_INTELLIGENCE"/);
  assert.match(route, /mode: "deep"/);
  assert.match(route, /tools: \[\]/);
  assert.match(route, /allow_mutating_tools: false/);
  assert.match(route, /mutation_authority: false/);
  assert.match(route, /communication_authority: false/);
  assert.match(route, /filing_authority: false/);
  assert.doesNotMatch(route, /financeGateway/);
  assert.doesNotMatch(route, /\.from\([^)]*\)\.insert|\.from\([^)]*\)\.update|\.from\([^)]*\)\.delete/);
});

test("Model output cannot invent Tax blockers or replace deterministic resolution proof", () => {
  assert.match(policy, /const liveByCode = new Map\(dependencies\.map/);
  assert.match(policy, /const selectedNext = liveByCode\.get\(nextCode\) \|\| dependencies\[0\] \|\| null/);
  assert.match(policy, /resolution_proof: live\.resolution_rule/);
  assert.match(policy, /action: selectedNext\.next_action/);
  assert.match(policy, /verification: selectedNext\.resolution_rule/);
  assert.match(policy, /manual_complete_allowed: false/);
  assert.match(policy, /advisory_only: true/);
});

test("Tax close intelligence falls back deterministically when owned intelligence is unavailable", () => {
  assert.match(route, /source = "DETERMINISTIC_FALLBACK"/);
  assert.match(route, /buildDeterministicFinanceTaxCloseBrief\(evidence, \{ fallbackReason: intelligenceError \}\)/);
  assert.match(policy, /Owned Intelligence was unavailable or invalid/);
  assert.match(policy, /Do not mark a Tax dependency complete manually/);
  assert.match(policy, /Do not file, post accounting, send client communication or change source evidence/);
});

test("Tax close intelligence is deliberate, filing-bound and visibly advisory", () => {
  assert.match(wrapper, /FinanceTaxCloseIntelligenceRail/);
  assert.match(wrapper, /selectedVatReturnId=\{selectedVatReturnId\}/);
  assert.match(rail, /Generate governed brief/);
  assert.match(rail, /body\.return_id !== selectedVatReturnId/);
  assert.match(rail, /body\.resolution_authority !== "LIVE_TAX_PREFLIGHT_ONLY"/);
  assert.match(rail, /body\.mutation_authority !== false \|\| body\.communication_authority !== false \|\| body\.filing_authority !== false/);
  assert.match(rail, /AI is explanation, never clearance/);
  assert.match(rail, /No mutation, communication or filing authority is exposed by this surface/);
  assert.doesNotMatch(rail, />\s*(File|Post|Send reminder|Resolve|Complete dependency)\s*</i);
});
