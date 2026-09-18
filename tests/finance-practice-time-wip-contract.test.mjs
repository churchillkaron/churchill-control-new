import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(new URL("../supabase/migrations/20260918084500_accounting_practice_time_wip.sql", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/workspace/finance/practice-time/route.js", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../components/workspace/finance/FinancePracticeTimeWip.jsx", import.meta.url), "utf8");
const tower = fs.readFileSync(new URL("../components/workspace/finance/FinancePracticeControlTower.jsx", import.meta.url), "utf8");

test("practice time is scoped to exact firm client engagement work and staff", () => {
  for (const field of ["accounting_firm_id", "organization_id", "entity_id", "engagement_id", "run_id", "work_item_id", "staff_account_id", "work_date", "minutes"]) assert.match(migration, new RegExp(field));
  assert.match(route, /\.eq\("accounting_firm_id", access\.organizationId\)/);
  assert.match(route, /accounting_engagement_work_items/);
  assert.match(route, /accounting_engagement_runs/);
  assert.match(route, /access\?\.access\?\.staffAccountId/);
});

test("practice time never invents a billing rate", () => {
  assert.match(migration, /default_hourly_rate numeric/);
  assert.match(route, /billingProfile\?\.default_hourly_rate != null/);
  assert.match(route, /: null/);
  assert.match(ui, /Avantiqo never invents a billing rate/);
  assert.match(ui, /rate required/);
});

test("WIP approval is separate from invoice authority", () => {
  assert.match(migration, /'DRAFT','SUBMITTED','APPROVED','BILLED','VOID'/);
  assert.match(route, /action === "approve"/);
  assert.match(route, /Only draft or submitted time can be approved/);
  assert.match(ui, /WIP becoming “billing ready” is not invoice authority/);
  assert.doesNotMatch(route, /customer[_-]invoices.*insert|finance_customer_invoices.*insert/i);
});

test("accounting firm has a first-class Time and WIP practice view", () => {
  assert.match(tower, /id: "economics", label: "Time & WIP"/);
  assert.match(tower, /FinancePracticeTimeWip/);
  assert.match(ui, /Record actual time/);
  assert.match(ui, /Client WIP/);
  assert.match(ui, /Budget/);
  assert.match(ui, /Actual/);
  assert.match(ui, /Billing ready/);
});
