import assert from "node:assert/strict";
import test from "node:test";

import {
  effectivePaperOrderExpiry,
  evaluatePaperOrderLifecycle,
} from "../lib/markets/runtime/MarketPaperOrderLifecycleModels.js";

test("DAY expiry uses earlier of market close and decision expiry", () => {
  assert.equal(effectivePaperOrderExpiry({
    timeInForce: "DAY",
    marketNextClose: "2026-09-18T20:00:00Z",
    decisionExpiresAt: "2026-09-18T19:00:00Z",
  }), "2026-09-18T19:00:00.000Z");
});

test("GTC remains bounded by governed decision expiry", () => {
  assert.equal(effectivePaperOrderExpiry({
    timeInForce: "GTC",
    marketNextClose: "2026-09-18T20:00:00Z",
    decisionExpiresAt: "2026-09-25T20:00:00Z",
  }), "2026-09-25T20:00:00.000Z");
});

test("decision expiry takes precedence over order lifetime", () => {
  const result = evaluatePaperOrderLifecycle({
    order: { status: "QUEUED", expires_at: "2026-09-20T20:00:00Z" },
    decision: { expires_at: "2026-09-18T10:00:00Z" },
    now: new Date("2026-09-18T12:00:00Z"),
  });
  assert.equal(result.active, false);
  assert.equal(result.reason, "GOVERNED_DECISION_EXPIRED");
});

test("DAY order expiry permanently blocks later fill", () => {
  const result = evaluatePaperOrderLifecycle({
    order: { status: "QUEUED", expires_at: "2026-09-18T10:00:00Z" },
    decision: { expires_at: "2026-09-20T10:00:00Z" },
    now: new Date("2026-09-18T12:00:00Z"),
  });
  assert.equal(result.active, false);
  assert.equal(result.reason, "ORDER_TIF_EXPIRED");
});
