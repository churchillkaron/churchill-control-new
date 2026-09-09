import assert from "node:assert/strict";
import test from "node:test";
import { registryRecordReadResponseText } from "../lib/operator/runtime/OperatorTurnRuntimeCore.js";

test("registry record read renderer returns useful invoice evidence without AI", () => {
  const response = registryRecordReadResponseText(
    { capability: "customer_invoices" },
    { result: { source: "/api/finance/customer-invoices/list", data: [
      { invoice_number: "INV-1", status: "draft", invoice_date: "2026-09-01", currency_code: "THB", total_amount: 2500 },
    ] } },
  );
  assert.match(response, /Customer Invoices: 1 current record/);
  assert.match(response, /INV-1/);
  assert.match(response, /draft/);
  assert.match(response, /THB/);
  assert.match(response, /2500/);
});

test("registry record read renderer states empty result explicitly", () => {
  const response = registryRecordReadResponseText(
    { capability: "work_orders" },
    { result: { source: "/api/operations/work-orders", data: [] } },
  );
  assert.equal(response, "No work orders were found for the current business context.");
});

test("canonical renderer handles Operations empty rows without AI", () => {
  const response = registryRecordReadResponseText(
    { capability: "assignments" },
    { result: { ok: true, rows: [], count: 0 } },
  );
  assert.equal(response, "No assignments were found for the current business context.");
});

test("canonical renderer handles Operations record rows", () => {
  const response = registryRecordReadResponseText(
    { capability: "assignments" },
    { result: { ok: true, rows: [{ name: "Stage setup", status: "active", priority: "high" }], count: 1 } },
  );
  assert.match(response, /Assignments: 1 current record/);
  assert.match(response, /Stage setup/);
  assert.match(response, /active/);
  assert.match(response, /high/);
});

test("canonical renderer handles metrics and state", () => {
  assert.equal(
    registryRecordReadResponseText({ capability: "cash_balance" }, { result: { value: 12500, currency: "THB" } }),
    "Cash Balance: 12500 THB.",
  );
  assert.equal(
    registryRecordReadResponseText({ capability: "business_day" }, { result: { status: "open" } }),
    "Business Day: Open.",
  );
});

test("canonical renderer surfaces read blocker", () => {
  assert.equal(
    registryRecordReadResponseText({ capability: "assignments" }, { result: { ok: false, error: "ASSIGNMENTS_READ_BLOCKED" } }),
    "ASSIGNMENTS_READ_BLOCKED",
  );
});
