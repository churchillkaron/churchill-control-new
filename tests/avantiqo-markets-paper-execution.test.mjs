import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPaperFillState,
  calculatePaperAccountEquity,
  calculatePaperExecutableQuantity,
  markPaperPosition,
  simulatePaperFillPrice,
} from "../lib/markets/runtime/MarketPaperExecutionModels.js";

test("paper fill price applies adverse slippage", () => {
  assert.equal(simulatePaperFillPrice({ side: "BUY", marketPrice: 100, slippageBps: 10 }), 100.1);
  assert.equal(simulatePaperFillPrice({ side: "SELL", marketPrice: 100, slippageBps: 10 }), 99.9);
});

test("paper execution caps BUY to configured ask-side participation", () => {
  const result = calculatePaperExecutableQuantity({
    side: "BUY",
    remainingQuantity: 100,
    snapshot: { ask_size: 2, bid_size: 9 },
    maxQuoteParticipation: 0.25,
    roundLotSize: 100,
  });

  assert.equal(result.displayed_shares, 200);
  assert.equal(result.executable_quantity, 50);
  assert.equal(result.liquidity_available, true);
  assert.ok(Math.abs(result.participation_rate - 0.25) < 1e-12);
});

test("paper execution uses bid liquidity for SELL and never exceeds remaining quantity", () => {
  const result = calculatePaperExecutableQuantity({
    side: "SELL",
    remainingQuantity: 12,
    snapshot: { ask_size: 10, bid_size: 4 },
    maxQuoteParticipation: 0.25,
    roundLotSize: 100,
  });

  assert.equal(result.displayed_shares, 400);
  assert.equal(result.executable_quantity, 12);
  assert.ok(result.participation_rate < 0.25);
});

test("paper execution refuses missing quote liquidity", () => {
  const result = calculatePaperExecutableQuantity({
    side: "BUY",
    remainingQuantity: 100,
    snapshot: { ask_size: 0 },
    maxQuoteParticipation: 0.25,
  });

  assert.equal(result.executable_quantity, 0);
  assert.equal(result.liquidity_available, false);
});

test("paper BUY consumes cash and builds weighted entry", () => {
  const result = applyPaperFillState({
    account: { cash_balance: 10000, realized_pnl: 0 },
    position: { quantity: 10, average_entry_price: 90, realized_pnl: 0 },
    side: "BUY",
    quantity: 5,
    fillPrice: 100,
    feeAmount: 5,
  });

  assert.equal(result.account.cash_balance, 9495);
  assert.equal(result.position.quantity, 15);
  assert.ok(Math.abs(result.position.average_entry_price - (1405 / 15)) < 1e-9);
});

test("paper BUY rejects insufficient cash", () => {
  assert.throws(
    () => applyPaperFillState({
      account: { cash_balance: 100 },
      position: null,
      side: "BUY",
      quantity: 2,
      fillPrice: 100,
    }),
    /INSUFFICIENT_PAPER_CASH/,
  );
});

test("paper SELL realizes profit and reduces position", () => {
  const result = applyPaperFillState({
    account: { cash_balance: 1000, realized_pnl: 0 },
    position: { quantity: 10, average_entry_price: 100, realized_pnl: 0 },
    side: "SELL",
    quantity: 4,
    fillPrice: 120,
    feeAmount: 2,
  });

  assert.equal(result.account.cash_balance, 1478);
  assert.equal(result.position.quantity, 6);
  assert.equal(result.realized_pnl_delta, 78);
  assert.equal(result.account.realized_pnl, 78);
});

test("paper SELL rejects quantity above long position", () => {
  assert.throws(
    () => applyPaperFillState({
      account: { cash_balance: 1000 },
      position: { quantity: 1, average_entry_price: 100 },
      side: "SELL",
      quantity: 2,
      fillPrice: 110,
    }),
    /INSUFFICIENT_PAPER_POSITION/,
  );
});

test("paper marking and equity use current market value", () => {
  const marked = markPaperPosition({
    position: { quantity: 10, average_entry_price: 100 },
    marketPrice: 110,
  });
  assert.equal(marked.market_value, 1100);
  assert.equal(marked.unrealized_pnl, 100);

  const account = calculatePaperAccountEquity({
    account: { cash_balance: 5000 },
    positions: [marked],
  });
  assert.equal(account.equity, 6100);
  assert.equal(account.unrealized_pnl, 100);
});
