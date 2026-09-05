import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const migration = read("supabase/migrations/20260905010500_finance_tax_dependency_work_envelopes.sql");
const route = read("app/api/finance/vat-returns/dependency-work/route.js");
const rail = read("components/workspace/finance/FinanceTaxCloseGuidanceRail.jsx");

test("Tax dependency envelopes persist coordination without becoming resolution truth", () => {
  assert.match(migration, /finance_tax_dependency_work_envelopes_scope_unique unique \(organization_id, entity_id, vat_return_id, dependency_code\)/);
  assert.match(migration, /assigned_to uuid null/);
  assert.match(migration, /target_at timestamptz null/);
  assert.match(migration, /acknowledged_at timestamptz null/);
  assert.match(migration, /note text null/);
  assert.match(migration, /This table is not authoritative for dependency resolution; live Tax preflight remains accounting truth/);
  assert.doesNotMatch(migration, /^\s*(status|resolved|completed|is_resolved)\s+/mi);
});

test("Tax dependency coordination reruns live evidence and refuses manual completion", () => {
  assert.match(route, /buildFinanceVatReturnPreflight/);
  assert.match(route, /applyFinanceTaxCalendarToPreflight/);
  assert.match(route, /applyFinanceVatCalculationMethodToPreflight/);
  assert.match(route, /deriveFinanceTaxCloseGuidance/);
  assert.match(route, /\["RESOLVE", "COMPLETE", "CLOSE", "DONE"\]/);
  assert.match(route, /Tax dependencies cannot be completed manually; resolution comes only from live Tax accounting truth/);
  assert.match(route, /Tax dependency is no longer active in live accounting truth; refresh before updating coordination work/);
  assert.match(route, /resolution_authority: "LIVE_TAX_PREFLIGHT_ONLY"/);
});

test("Tax dependency ownership cannot be stolen through a stale coordination write", () => {
  assert.match(route, /const ownedByAnother = Boolean\(existing\?\.assigned_to && existing\.assigned_to !== actorId\)/);
  assert.match(route, /This Tax dependency already has a current owner; refresh before changing ownership/);
  assert.match(route, /Only the current Tax dependency owner can release ownership/);
  assert.match(route, /Only the current Tax dependency owner can acknowledge assigned work/);
  assert.match(route, /Only the current Tax dependency owner can update assigned coordination work/);
});

test("Tax close rail binds durable coordination to the exact selected live filing", () => {
  assert.match(rail, /\/api\/finance\/vat-returns\/dependency-work/);
  assert.match(rail, /url\.searchParams\.set\("vatReturnId", selectedVatReturnId\)/);
  assert.match(rail, /body\.return_id !== selectedVatReturnId/);
  assert.match(rail, /body\.resolution_authority !== "LIVE_TAX_PREFLIGHT_ONLY"/);
  assert.match(rail, /guidance: body\.guidance \|\| null/);
  assert.match(rail, /Take ownership/);
  assert.match(rail, /Acknowledge/);
  assert.match(rail, /Target date/);
  assert.match(rail, /Coordination note/);
  assert.match(rail, /Save coordination/);
  assert.match(rail, /There is deliberately no manual complete or resolve control/);
  assert.doesNotMatch(rail, />\s*(Mark complete|Resolve dependency|Complete dependency)\s*</i);
});
