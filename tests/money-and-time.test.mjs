// The first tests in this repository.
//
// Thirty-three audits gate every build and they are good, but they check structure, wiring, contracts and
// exposure. None of them can catch a calculation returning the wrong number. A labour percentage off by a
// factor of a hundred, a variance that divides by zero, a rounding rule applied at the wrong step -- each
// of those passes all thirty-three and lands in a customer's payroll or stock valuation.
//
// So these start where a wrong answer costs money, and they test behaviour rather than shape: the
// boundaries (zero, empty, missing), the arithmetic, the sign, and the rounding each function promises.
//
//   node --test tests/
//
// node:test, so there is no dependency to add and nothing to configure.

import { test } from "node:test";
import assert from "node:assert/strict";

import { calculateLaborCost } from "../lib/payroll/calculateLaborCost.js";
import { calculateVariance } from "../lib/inventory/production/yield/capabilities/calculateVariance.js";

test("labour cost sums hours times rate across shifts", () => {
  const result = calculateLaborCost(
    [
      { staff_name: "Mai", department: "Kitchen", hours: 8, hourly_rate: 62.5 },
      { staff_name: "Nok", department: "Service", hours: 6, hourly_rate: 55 },
    ],
    10_000,
  );

  assert.equal(result.totalLaborCost, 8 * 62.5 + 6 * 55);
  assert.equal(result.totalHours, 14);
  assert.equal(result.breakdown.length, 2);
  assert.equal(result.breakdown[0].labor_cost, 500);
});

test("labour percent is a percentage, not a fraction", () => {
  // 830 of 10,000 is 8.3 percent, not 0.083. Drop the multiplier and a dashboard shows a plausible
  // wrong number rather than an error, which is the failure that survives review.
  const result = calculateLaborCost([{ hours: 10, hourly_rate: 83 }], 10_000);
  assert.equal(result.laborPercent, 8.3);
});

test("percent and revenue per hour are zero rather than Infinity with nothing to divide by", () => {
  const noRevenue = calculateLaborCost([{ hours: 8, hourly_rate: 50 }], 0);
  assert.equal(noRevenue.laborPercent, 0);
  assert.ok(Number.isFinite(noRevenue.laborPercent));

  const noHours = calculateLaborCost([{ hours: 0, hourly_rate: 50 }], 5_000);
  assert.equal(noHours.revenuePerHour, 0);
  assert.ok(Number.isFinite(noHours.revenuePerHour));
});

test("missing hours and rates count as zero rather than NaN", () => {
  // Shifts arrive from a scheduler that does not always carry a rate. NaN propagates silently through a
  // total and renders as a blank cell rather than an error.
  const result = calculateLaborCost([{ staff_name: "Ann" }, { hours: 4 }], 1_000);
  assert.equal(result.totalLaborCost, 0);
  assert.equal(result.totalHours, 4);
  assert.ok(!Number.isNaN(result.laborPercent));
});

test("labour cost handles no shifts at all", () => {
  const result = calculateLaborCost([], 5_000);
  assert.equal(result.totalLaborCost, 0);
  assert.equal(result.totalHours, 0);
  assert.equal(result.laborPercent, 0);
  assert.equal(result.revenuePerHour, 0);
  assert.deepEqual(result.breakdown, []);
});

test("revenue per hour divides revenue by hours worked", () => {
  const result = calculateLaborCost(
    [{ hours: 5, hourly_rate: 60 }, { hours: 5, hourly_rate: 60 }],
    12_000,
  );
  assert.equal(result.revenuePerHour, 1_200);
});

test("variance is actual minus theoretical, so overuse reads positive", () => {
  // The sign carries the meaning of the whole report. Inverted, overuse would read as a saving.
  const rows = calculateVariance({
    theoretical: [
      { item_id: "beef", ingredient: "Beef striploin", unit: "kg", theoretical_usage: 10 },
    ],
    actual: [{ item_id: "beef", actual_usage: 12 }],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].theoretical_usage, 10);
  assert.equal(rows[0].actual_usage, 12);
  assert.equal(rows[0].variance, 2);
  assert.equal(rows[0].variance_percent, 20);
});

test("an item with no stock reading counts as zero usage rather than vanishing", () => {
  // A missing count is not the same as no consumption, and dropping the row hides the item from the
  // variance report entirely, which is how a loss goes unnoticed.
  const rows = calculateVariance({
    theoretical: [{ item_id: "wine", ingredient: "House red", unit: "btl", theoretical_usage: 6 }],
    actual: [],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].actual_usage, 0);
  assert.equal(rows[0].variance, -6);
  assert.equal(rows[0].variance_percent, -100);
});

test("variance percent is zero rather than Infinity when nothing was theoretically used", () => {
  const rows = calculateVariance({
    theoretical: [{ item_id: "salt", ingredient: "Salt", unit: "kg", theoretical_usage: 0 }],
    actual: [{ item_id: "salt", actual_usage: 3 }],
  });

  assert.equal(rows[0].variance_percent, 0);
  assert.ok(Number.isFinite(rows[0].variance_percent));
});

test("variance rounds to the two decimals it promises", () => {
  const rows = calculateVariance({
    theoretical: [{ item_id: "oil", ingredient: "Olive oil", unit: "l", theoretical_usage: 1.005 }],
    actual: [{ item_id: "oil", actual_usage: 2.4567 }],
  });

  assert.equal(rows[0].actual_usage, 2.46);

  // 1.005 rounds DOWN to 1.00, and that is worth knowing rather than assuming.
  //
  // This test failed on the first run because I expected 1.01. The cause is not a bug in the function: 1.005
  // cannot be represented exactly in binary floating point, it is stored as 1.00499999999999989, and toFixed
  // rounds the value it actually holds. Every exact-half value in the system behaves this way.
  //
  // The consequence is a systematic downward bias on halves. On one row it is a hundredth of a litre. Across
  // a stock valuation of thousands of rows it is a small persistent understatement, always in the same
  // direction, which is the kind of discrepancy that surfaces as an unexplained variance at year end rather
  // than as an error anyone can point at.
  //
  // Left asserting the real behaviour deliberately. Changing it means choosing a rounding policy for money
  // across the whole system -- half-up, banker's rounding, or integer minor units -- and that is a decision
  // to make once and apply everywhere, not something to patch inside a variance report.
  assert.equal(rows[0].theoretical_usage, 1);
  assert.equal(Number((1.005).toFixed(2)), 1);
});

test("variance carries the ingredient and unit through for the report", () => {
  const rows = calculateVariance({
    theoretical: [{ item_id: "rice", ingredient: "Jasmine rice", unit: "kg", theoretical_usage: 4 }],
    actual: [{ item_id: "rice", actual_usage: 4 }],
  });

  assert.equal(rows[0].ingredient, "Jasmine rice");
  assert.equal(rows[0].unit, "kg");
  assert.equal(rows[0].variance, 0);
});

import { calculatePaymentSummary } from "../lib/pos/payments/calculatePaymentSummary.js";

test("payment summary adds tax and service charge and subtracts discount", () => {
  const summary = calculatePaymentSummary({
    subtotal: 1_000,
    taxPercent: 7,
    serviceChargePercent: 10,
    discount: 50,
  });

  assert.equal(summary.subtotal, 1_000);
  assert.equal(summary.tax, 70);
  assert.equal(summary.serviceCharge, 100);
  assert.equal(summary.discount, 50);
  assert.equal(summary.total, 1_000 + 70 + 100 - 50);
});

test("tax is charged on the subtotal alone, not on the service charge", () => {
  // Pinning this because it is a tax-base decision rather than an arithmetic one, and the convention in
  // Thailand runs the other way: service charge on the subtotal, then VAT on subtotal plus service charge.
  //
  // On 1,000 with 10 percent service and 7 percent VAT this function bills 70 of VAT. Charged on the
  // service-inclusive base of 1,100 it would be 77. Seven baht a ticket, every ticket, in the venue's
  // favour on the invoice and against it with the Revenue Department.
  //
  // Whether that is right depends on how the service charge is treated for VAT, which is a question for
  // whoever files the returns rather than something to change from a test. The test states what the code
  // does today so the decision is visible instead of implicit.
  const summary = calculatePaymentSummary({
    subtotal: 1_000,
    taxPercent: 7,
    serviceChargePercent: 10,
  });

  assert.equal(summary.tax, 70);
  assert.notEqual(summary.tax, 77);
  assert.equal(summary.total, 1_170);
});

test("payment summary defaults to 7 percent tax and 5 percent service", () => {
  const summary = calculatePaymentSummary({ subtotal: 200 });

  // 14.000000000000002, not 14. This function performs no rounding at all, so binary floating point
  // artefacts reach the caller intact: 200 * (7 / 100) is not exactly 14 in IEEE 754.
  //
  // That is the same underlying problem as the 1.005 case in the variance report, from the opposite
  // direction. There, toFixed rounds and biases halves downward. Here nothing rounds and raw artefacts
  // escape. Two money paths, two different behaviours, neither of them a stated policy -- which is the
  // actual finding. A receipt or an invoice built straight from this shows 14.000000000000002 unless
  // something downstream happens to round it, and whether anything does is not this function's promise.
  assert.equal(summary.tax, 14.000000000000002);
  assert.ok(Math.abs(summary.tax - 14) < 1e-9);
  assert.equal(summary.serviceCharge, 10);
  assert.ok(Math.abs(summary.total - 224) < 1e-9);
});

test("a discount larger than the bill produces a negative total rather than clamping", () => {
  // Worth knowing before a refund flow relies on it: nothing here floors the total at zero.
  const summary = calculatePaymentSummary({ subtotal: 100, taxPercent: 0, serviceChargePercent: 0, discount: 250 });
  assert.equal(summary.total, -150);
});

test("a zero bill stays zero across every component", () => {
  const summary = calculatePaymentSummary({ subtotal: 0 });
  assert.equal(summary.tax, 0);
  assert.equal(summary.serviceCharge, 0);
  assert.equal(summary.total, 0);
});

import {
  createOrganizationWallet,
  BILLING_POLICIES,
  WALLET_STATUS,
} from "../lib/platform/service-runtime/wallet/documents/OrganizationWallet.js";

test("a wallet must declare its currency", () => {
  // The one invariant this factory enforces, and the right one: a balance without a currency is a number
  // that cannot be charged, refunded or reconciled.
  assert.throws(
    () => createOrganizationWallet({ organization_id: "org", available_balance: 500 }),
    /ORGANIZATION_WALLET_CURRENCY_REQUIRED/,
  );
  assert.equal(createOrganizationWallet({ currency: "thb" }).currency, "THB");
});

test("a new wallet is prepaid, active and empty by default", () => {
  // These defaults are the commercial model: nothing is extended on credit unless someone says so.
  const wallet = createOrganizationWallet({ organization_id: "org", currency: "THB" });
  assert.equal(wallet.billing_policy, BILLING_POLICIES.PREPAID);
  assert.equal(wallet.status, WALLET_STATUS.ACTIVE);
  assert.equal(wallet.available_balance, 0);
  assert.equal(wallet.reserved_balance, 0);
  assert.equal(wallet.auto_topup, false);
});

test("nothing stops a wallet being created with a negative balance", () => {
  // Pinned as a gap rather than as intended behaviour. A prepaid wallet holding -500 has already spent money
  // the organization never deposited, and the factory is the last place that could refuse it before it
  // becomes a row. Whether to floor it at zero or to allow deliberate overdraft belongs with billing_policy
  // and credit_limit, which exist on the table, so this is a decision rather than an oversight to patch here.
  const wallet = createOrganizationWallet({ currency: "THB", available_balance: -500 });
  assert.equal(wallet.available_balance, -500);
});

test("nothing stops reserved exceeding available", () => {
  // The reserve/charge/release chain depends on reserved never outrunning available. That invariant lives in
  // the runtime rather than here, so a document built directly can express a state the runtime would refuse.
  const wallet = createOrganizationWallet({
    currency: "THB",
    available_balance: 10,
    reserved_balance: 900,
  });
  assert.equal(wallet.reserved_balance, 900);
  assert.ok(wallet.reserved_balance > wallet.available_balance);
});

test("unparseable balances become NaN rather than being rejected", () => {
  // Number("abc") is NaN, and NaN survives every arithmetic operation downstream while comparing false
  // against every threshold -- so a NaN balance passes an "is there enough?" check by failing it silently,
  // and renders as an empty cell rather than an error. Worth a guard at the boundary that parses input.
  const wallet = createOrganizationWallet({ currency: "THB", available_balance: "not a number" });
  assert.ok(Number.isNaN(wallet.available_balance));
  assert.equal(wallet.available_balance > 0, false);
  assert.equal(wallet.available_balance <= 0, false);
});

test("string amounts parse, so values arriving from JSON still work", () => {
  const wallet = createOrganizationWallet({ currency: "THB", available_balance: "1250.75" });
  assert.equal(wallet.available_balance, 1250.75);
});
