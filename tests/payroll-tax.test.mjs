// Progressive income tax, against the real Thai brackets the country pack ships.
//
// This is the last money path in the platform with nothing checking it, and it is the one where a wrong
// answer is hardest to notice: withholding that is quietly too low produces a bill at filing, and too high
// takes money from staff that nobody flags. The 34 audits cannot see any of it -- they check structure, and
// this is arithmetic.
//
// The brackets below are the ones in lib/payroll/countries/thailand.js, not invented figures: 0 percent to
// 150,000, then 5, 10, 15, 20 and 25 percent at 300k, 500k, 750k and 1m. Every expected value here is worked
// out by hand from those bands so the test fails if the function stops agreeing with them, rather than
// agreeing with whatever the function currently returns.

import { test } from "node:test";
import assert from "node:assert/strict";

import calculateProgressiveTax from "../lib/payroll/tax/calculateProgressiveTax.js";
import thailand from "../lib/payroll/countries/thailand.js";

const BRACKETS = thailand.tax_brackets;

test("the Thai country pack still ships the brackets these tests assume", () => {
  // If somebody edits the bands, the arithmetic below stops meaning what it says, so this fails first and
  // points at the cause instead of leaving six confusing failures behind it.
  assert.deepEqual(
    BRACKETS.map((bracket) => [bracket.threshold, bracket.rate]),
    [[0, 0], [150_000, 5], [300_000, 10], [500_000, 15], [750_000, 20], [1_000_000, 25]],
  );
});

test("income inside the zero-rate band is not taxed", () => {
  for (const taxableIncome of [0, 1, 149_999, 150_000]) {
    assert.equal(calculateProgressiveTax({ taxableIncome, taxBrackets: BRACKETS }), 0);
  }
});

test("only the amount above a threshold is taxed at that band's rate", () => {
  // 200,000 leaves 50,000 in the 5 percent band. Taxing the whole 200,000 would give 10,000, which is the
  // classic progressive-tax bug and the one worth pinning hardest.
  assert.equal(
    calculateProgressiveTax({ taxableIncome: 200_000, taxBrackets: BRACKETS }),
    50_000 * 0.05,
  );
});

test("tax accumulates across every band the income passes through", () => {
  // 600,000: nothing on the first 150k, 5 percent on 150k, 10 percent on 200k, 15 percent on 100k.
  const expected = 150_000 * 0.05 + 200_000 * 0.10 + 100_000 * 0.15;
  assert.equal(expected, 42_500);
  assert.equal(
    calculateProgressiveTax({ taxableIncome: 600_000, taxBrackets: BRACKETS }),
    expected,
  );
});

test("the top band has no ceiling", () => {
  // 2,000,000: the full stack plus 25 percent on the 1,000,000 above the top threshold.
  const expected =
    150_000 * 0.05 + 200_000 * 0.10 + 250_000 * 0.15 + 250_000 * 0.20 + 1_000_000 * 0.25;
  // 7,500 + 20,000 + 37,500 + 50,000 + 250,000. This assertion exists because I first wrote 380,000 here
  // from a sloppy mental sum, and it failed against the function rather than the other way round -- the
  // function was right. Pinning the total as a literal keeps the hand-check honest.
  assert.equal(expected, 365_000);
  assert.equal(
    calculateProgressiveTax({ taxableIncome: 2_000_000, taxBrackets: BRACKETS }),
    expected,
  );
});

test("tax rises monotonically with income", () => {
  // A band boundary computed the wrong way round can make a raise reduce take-home pay. Cheap to assert and
  // it covers every boundary at once.
  let previous = -1;
  for (const income of [0, 150_000, 150_001, 300_000, 300_001, 500_000, 750_000, 1_000_000, 1_500_000]) {
    const tax = calculateProgressiveTax({ taxableIncome: income, taxBrackets: BRACKETS });
    assert.ok(tax >= previous, `tax fell from ${previous} to ${tax} at income ${income}`);
    previous = tax;
  }
});

test("crossing a threshold by one baht costs pennies, not a band", () => {
  // The step at a boundary must be marginal. A cliff here means someone earning one baht more loses
  // thousands, which is the shape of bug that reaches a payslip before anyone models it.
  const at = calculateProgressiveTax({ taxableIncome: 300_000, taxBrackets: BRACKETS });
  const justOver = calculateProgressiveTax({ taxableIncome: 300_001, taxBrackets: BRACKETS });
  assert.ok(justOver - at < 1, `crossing 300,000 added ${justOver - at}`);
});

test("brackets supplied out of order are sorted before use", () => {
  const shuffled = [...BRACKETS].reverse();
  assert.equal(
    calculateProgressiveTax({ taxableIncome: 600_000, taxBrackets: shuffled }),
    calculateProgressiveTax({ taxableIncome: 600_000, taxBrackets: BRACKETS }),
  );
});

test("no brackets means no tax rather than a crash", () => {
  // A country pack without bands -- the UAE pack ships a zero-rate table -- must not throw mid-payroll.
  assert.equal(calculateProgressiveTax({ taxableIncome: 500_000, taxBrackets: [] }), 0);
  assert.equal(calculateProgressiveTax({}), 0);
});

test("tax is rounded to two decimals", () => {
  const tax = calculateProgressiveTax({ taxableIncome: 187_333.33, taxBrackets: BRACKETS });
  assert.equal(tax, Number(tax.toFixed(2)));
  assert.equal(tax, Number(((187_333.33 - 150_000) * 0.05).toFixed(2)));
});
