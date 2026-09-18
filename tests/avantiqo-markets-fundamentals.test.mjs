import assert from "node:assert/strict";
import test from "node:test";

import { buildFundamentalSnapshot } from "../lib/markets/runtime/MarketFundamentalModels.js";
import {
  assessFundamentalFreshness,
  buildFundamentalThesis,
} from "../lib/markets/runtime/MarketSpecialistModels.js";

function duration(start, end, val, concept, form = "10-K") {
  return {
    start,
    end,
    val,
    form,
    filed: end < "2026-01-01" ? "2026-02-20" : "2027-02-20",
    accn: `000-${concept}-${end}`,
  };
}

function instant(end, val, concept, form = "10-K") {
  return {
    end,
    val,
    form,
    filed: end < "2026-01-01" ? "2026-02-20" : "2027-02-20",
    accn: `000-${concept}-${end}`,
  };
}

function companyFacts() {
  const priorStart = "2025-01-01";
  const priorEnd = "2025-12-31";
  const currentStart = "2026-01-01";
  const currentEnd = "2026-12-31";

  return {
    facts: {
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: {
          units: {
            USD: [
              duration(priorStart, priorEnd, 1000, "revenue"),
              duration(currentStart, currentEnd, 1200, "revenue"),
            ],
          },
        },
        NetIncomeLoss: {
          units: {
            USD: [
              duration(currentStart, currentEnd, 180, "net-income"),
            ],
          },
        },
        OperatingIncomeLoss: {
          units: {
            USD: [
              duration(currentStart, currentEnd, 240, "operating-income"),
            ],
          },
        },
        NetCashProvidedByUsedInOperatingActivities: {
          units: {
            USD: [
              duration(currentStart, currentEnd, 260, "ocf"),
            ],
          },
        },
        Assets: {
          units: { USD: [instant(currentEnd, 1500, "assets")] },
        },
        Liabilities: {
          units: { USD: [instant(currentEnd, 500, "liabilities")] },
        },
        AssetsCurrent: {
          units: { USD: [instant(currentEnd, 700, "current-assets")] },
        },
        LiabilitiesCurrent: {
          units: { USD: [instant(currentEnd, 350, "current-liabilities")] },
        },
        CashAndCashEquivalentsAtCarryingValue: {
          units: { USD: [instant(currentEnd, 300, "cash")] },
        },
      },
    },
  };
}

test("builds an evidence-backed bullish fundamental snapshot from SEC-style facts", () => {
  const snapshot = buildFundamentalSnapshot({
    symbol: "TEST",
    cik: "0000000001",
    companyFacts: companyFacts(),
  });

  assert.equal(snapshot.period_end, "2026-12-31");
  assert.ok(Math.abs(snapshot.ratios.revenue_growth - 0.2) < 1e-12);
  assert.ok(Math.abs(snapshot.ratios.net_margin - 0.15) < 1e-12);
  assert.ok(snapshot.score > 0.15);
  assert.equal(snapshot.stance, "BULLISH");
  assert.ok(snapshot.confidence > 0.7);
  assert.ok(Object.keys(snapshot.facts_used).length >= 7);
});

test("fails closed when revenue history is unavailable", () => {
  const snapshot = buildFundamentalSnapshot({
    symbol: "TEST",
    cik: "0000000001",
    companyFacts: { facts: { "us-gaap": {} } },
  });

  assert.equal(snapshot.period_end, null);
  assert.equal(snapshot.stance, "INSUFFICIENT_EVIDENCE");
  assert.equal(snapshot.confidence, 0);
});

test("fundamental specialist consumes admitted deterministic snapshot", () => {
  const snapshot = buildFundamentalSnapshot({
    symbol: "TEST",
    cik: "0000000001",
    companyFacts: companyFacts(),
  });

  const thesis = buildFundamentalThesis({
    symbol: "TEST",
    filings: [{ symbol: "TEST", form_type: "10-K" }],
    fundamentals: [{
      symbol: "TEST",
      period_end: snapshot.period_end,
      score: snapshot.score,
      confidence: snapshot.confidence,
      stance: snapshot.stance,
      ratios: snapshot.ratios,
      metrics: snapshot.metrics,
      facts_used: snapshot.facts_used,
    }],
    now: new Date("2027-03-01T00:00:00Z"),
  });

  assert.equal(thesis.stance, "BULLISH");
  assert.ok(thesis.confidence > 0.7);
  assert.equal(thesis.rationale.method, "SEC XBRL deterministic fundamental composite");
  assert.equal(thesis.rationale.freshness.fresh, true);
});

test("quarterly fundamental evidence expires after the freshness window", () => {
  const freshness = assessFundamentalFreshness({
    fundamental: {
      facts_used: {
        revenue: {
          filed: "2026-01-15",
          form: "10-Q",
        },
      },
    },
    now: new Date("2026-08-01T00:00:00Z"),
  });

  assert.equal(freshness.fresh, false);
  assert.equal(freshness.reason, "STALE_FILING_EVIDENCE");
  assert.equal(freshness.max_age_days, 180);
});

test("annual fundamental evidence uses a longer bounded freshness window", () => {
  const freshness = assessFundamentalFreshness({
    fundamental: {
      facts_used: {
        revenue: {
          filed: "2026-02-20",
          form: "10-K",
        },
      },
    },
    now: new Date("2027-03-01T00:00:00Z"),
  });

  assert.equal(freshness.fresh, true);
  assert.equal(freshness.max_age_days, 450);
});

test("future-dated filing evidence fails closed", () => {
  const freshness = assessFundamentalFreshness({
    fundamental: {
      facts_used: {
        revenue: {
          filed: "2026-10-01",
          form: "10-Q",
        },
      },
    },
    now: new Date("2026-09-18T00:00:00Z"),
  });

  assert.equal(freshness.fresh, false);
  assert.equal(freshness.reason, "FUTURE_DATED_FILING_EVIDENCE");
});

test("stale admitted fundamentals lose their specialist vote", () => {
  const thesis = buildFundamentalThesis({
    symbol: "TEST",
    filings: [{ symbol: "TEST", form_type: "10-Q" }],
    fundamentals: [{
      symbol: "TEST",
      period_end: "2025-12-31",
      score: 0.7,
      confidence: 0.85,
      stance: "BULLISH",
      ratios: {},
      metrics: {},
      facts_used: {
        revenue: {
          filed: "2026-01-15",
          form: "10-Q",
        },
      },
    }],
    now: new Date("2026-09-18T00:00:00Z"),
  });

  assert.equal(thesis.stance, "INSUFFICIENT_EVIDENCE");
  assert.equal(thesis.confidence, 0);
  assert.equal(thesis.rationale.freshness.reason, "STALE_FILING_EVIDENCE");
});
