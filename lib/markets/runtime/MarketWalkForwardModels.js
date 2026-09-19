import {
  buildQuantThesis,
  buildTechnicalThesis,
  synthesizeMarketDecision,
} from "./MarketSpecialistModels.js";

function number(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateOnly(value) {
  const time = new Date(value || 0);
  return Number.isFinite(time.getTime()) ? time.toISOString().slice(0, 10) : null;
}

function normalizeBars(bars = []) {
  return [...bars]
    .filter((row) => number(row?.open, null) > 0 && number(row?.close, null) > 0)
    .sort((left, right) => new Date(left.bar_time || 0) - new Date(right.bar_time || 0));
}

function executionPrice(open, side, costBps) {
  const cost = Math.max(0, number(costBps, 0)) / 10000;
  return side === "BUY"
    ? open * (1 + cost)
    : open * (1 - cost);
}

function drawdownPct(equity, highWater) {
  if (!(highWater > 0)) return 0;
  return Math.max(0, ((highWater - equity) / highWater) * 100);
}

export function simulateWalkForward({
  symbol,
  bars = [],
  trainingBars = 80,
  testBars = 20,
  transactionCostBps = 10,
  initialEquity = 100000,
}) {
  const rows = normalizeBars(bars);
  const trainSize = Math.max(20, Math.floor(number(trainingBars, 80)));
  const foldSize = Math.max(1, Math.floor(number(testBars, 20)));
  const startingCapital = number(initialEquity, 100000);

  if (rows.length < trainSize + 1) {
    return {
      status: "INSUFFICIENT_DATA",
      symbol,
      folds: [],
      summary: {
        required_bars: trainSize + 1,
        available_bars: rows.length,
      },
    };
  }

  let cash = startingCapital;
  let quantity = 0;
  let highWater = startingCapital;
  let maxDrawdown = 0;
  let totalTrades = 0;
  let directionalHits = 0;
  let directionalTests = 0;
  let totalTurnover = 0;
  const folds = [];

  for (let foldStart = trainSize, foldIndex = 0; foldStart < rows.length; foldStart += foldSize, foldIndex += 1) {
    const foldEndExclusive = Math.min(rows.length, foldStart + foldSize);
    const startingEquity = cash + (quantity * number(rows[foldStart - 1]?.close));
    const foldHighStart = highWater;
    let foldTrades = 0;
    let foldHits = 0;
    let foldTests = 0;
    let foldTurnover = 0;
    let foldMaxDrawdown = drawdownPct(startingEquity, highWater);
    const decisions = [];

    for (let index = foldStart; index < foldEndExclusive; index += 1) {
      const testBar = rows[index];
      const historyStart = Math.max(0, index - trainSize);
      const history = rows.slice(historyStart, index);
      const theses = [
        buildTechnicalThesis({ symbol, bars: history }),
        buildQuantThesis({ symbol, bars: history }),
      ];
      const decision = synthesizeMarketDecision({
        symbol,
        theses,
        horizon: "SHORT",
      });

      const open = number(testBar.open);
      const close = number(testBar.close);
      const priorEquity = cash + (quantity * open);
      let tradedNotional = 0;

      if (decision.action === "BUY" && quantity <= 0 && cash > 0) {
        const fill = executionPrice(open, "BUY", transactionCostBps);
        quantity = cash / fill;
        tradedNotional = cash;
        cash = 0;
        foldTrades += 1;
        totalTrades += 1;
      } else if (decision.action === "SELL" && quantity > 0) {
        const fill = executionPrice(open, "SELL", transactionCostBps);
        tradedNotional = quantity * fill;
        cash = tradedNotional;
        quantity = 0;
        foldTrades += 1;
        totalTrades += 1;
      }

      if (tradedNotional > 0 && priorEquity > 0) {
        const turnover = tradedNotional / priorEquity;
        foldTurnover += turnover;
        totalTurnover += turnover;
      }

      const actualReturn = open > 0 ? (close - open) / open : 0;
      if (decision.action === "BUY" || decision.action === "SELL") {
        const hit = decision.action === "BUY" ? actualReturn > 0 : actualReturn < 0;
        directionalTests += 1;
        foldTests += 1;
        if (hit) {
          directionalHits += 1;
          foldHits += 1;
        }
      }

      const endingEquity = cash + (quantity * close);
      highWater = Math.max(highWater, endingEquity);
      const currentDrawdown = drawdownPct(endingEquity, highWater);
      maxDrawdown = Math.max(maxDrawdown, currentDrawdown);
      foldMaxDrawdown = Math.max(foldMaxDrawdown, currentDrawdown);

      decisions.push({
        signal_date: dateOnly(history[history.length - 1]?.bar_time),
        execution_date: dateOnly(testBar.bar_time),
        action: decision.action,
        confidence: decision.confidence,
        open,
        close,
        actual_return: actualReturn,
        ending_equity: endingEquity,
      });
    }

    const endingEquity = cash + (quantity * number(rows[foldEndExclusive - 1]?.close));
    folds.push({
      fold_index: foldIndex,
      train_start: dateOnly(rows[Math.max(0, foldStart - trainSize)]?.bar_time),
      train_end: dateOnly(rows[foldStart - 1]?.bar_time),
      test_start: dateOnly(rows[foldStart]?.bar_time),
      test_end: dateOnly(rows[foldEndExclusive - 1]?.bar_time),
      starting_equity: startingEquity,
      ending_equity: endingEquity,
      fold_return: startingEquity > 0 ? (endingEquity - startingEquity) / startingEquity : 0,
      max_drawdown_pct: foldMaxDrawdown,
      trade_count: foldTrades,
      directional_hits: foldHits,
      directional_tests: foldTests,
      turnover: foldTurnover,
      decisions,
      fold_high_water_start: foldHighStart,
    });
  }

  const finalClose = number(rows[rows.length - 1]?.close);
  const finalEquity = cash + (quantity * finalClose);
  return {
    status: "COMPLETED",
    symbol,
    folds,
    summary: {
      strategy_key: "TECHNICAL_QUANT_V1",
      data_start: dateOnly(rows[0]?.bar_time),
      data_end: dateOnly(rows[rows.length - 1]?.bar_time),
      training_bars: trainSize,
      test_bars: foldSize,
      transaction_cost_bps: number(transactionCostBps, 10),
      initial_equity: startingCapital,
      final_equity: finalEquity,
      total_return: startingCapital > 0 ? (finalEquity - startingCapital) / startingCapital : 0,
      max_drawdown_pct: maxDrawdown,
      trade_count: totalTrades,
      directional_hits: directionalHits,
      directional_tests: directionalTests,
      directional_hit_rate: directionalTests > 0 ? directionalHits / directionalTests : null,
      turnover: totalTurnover,
      ending_position_quantity: quantity,
    },
  };
}
