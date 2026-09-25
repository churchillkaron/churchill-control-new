import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  resolveCustomerInvoiceDatePlan,
} from "../lib/operator/runtime/CustomerInvoiceDateIntentRuntime.mjs";

function dateInBangkok() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function offset(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function nextWeekday(baseIso, target) {
  const d = new Date(`${baseIso}T12:00:00Z`);
  let delta = (target - d.getUTCDay() + 7) % 7;
  if (delta === 0) delta = 7;
  return offset(baseIso, delta);
}
function previousWeekday(baseIso, target) {
  const d = new Date(`${baseIso}T12:00:00Z`);
  let delta = (d.getUTCDay() - target + 7) % 7;
  if (delta === 0) delta = 7;
  return offset(baseIso, -delta);
}

test("Moonshine wording binds Monday invoice/due date and prior Thursday/Sunday service dates", () => {
  const today = dateInBangkok();
  const monday = nextWeekday(today, 1);
  const plan = resolveCustomerInvoiceDatePlan({
    message:
      "can you make new invoice for moonshine, Monday due date and invoice date, and then previous Thursday and Sunday same as the last one",
    timezone: "Asia/Bangkok",
    fallbackInvoiceDate: "2026-09-15",
    fallbackDueDate: "2026-09-15",
    expectedLines: 2,
  });

  assert.equal(plan.invoice_date, monday);
  assert.equal(plan.due_date, monday);
  assert.deepEqual(plan.service_dates, [
    previousWeekday(monday, 4),
    previousWeekday(monday, 0),
  ]);
});

test("deterministic customer invoice is fast-pathed before provider-dependent supervision", () => {
  const source = fs.readFileSync(
    "lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js",
    "utf8",
  );
  const fastPath = source.indexOf("const deterministicInvoiceFastPath =");
  const calibration = source.indexOf("const measuredCalibrationPolicy = await");
  assert.ok(fastPath >= 0);
  assert.ok(calibration > fastPath);
  assert.match(source, /finance\.accounts_receivable\.CreateCustomerInvoice/);
  assert.match(source, /deterministic_exact_action_fast_path: true/);
  assert.match(source, /const deterministicResult = await runOperatorTurn\(/);
  assert.match(source, /execution_governance_bypassed: false/);
});

test("home intelligence busy row renders one timing presentation", () => {
  const source = fs.readFileSync(
    "components/operator/HomeAvantiqoIntelligence.jsx",
    "utf8",
  );
  assert.match(source, /busyRequestStatus\(liveExecution, busyElapsedSeconds, activeRequestStartedAt\)/);
  assert.doesNotMatch(source, /aria-label="elapsed time"/);
  assert.doesNotMatch(source, /· \{busyElapsedSeconds\}s/);
});
