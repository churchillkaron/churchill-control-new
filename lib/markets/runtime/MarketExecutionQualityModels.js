function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeBps(numerator, denominator) {
  if (!(denominator > 0) || numerator === null) return null;
  return (numerator / denominator) * 10000;
}

export function calculateExecutionQuality({
  side,
  orderQuantity,
  fillQuantity,
  arrivalPrice,
  marketReferencePrice,
  fillPrice,
  bidPrice = null,
  askPrice = null,
  displayedShares = null,
  feeAmount = 0,
}) {
  const normalizedSide = String(side || "").trim().toUpperCase();
  const direction = normalizedSide === "SELL" ? -1 : 1;
  const orderQty = Math.max(0, number(orderQuantity, 0));
  const fillQty = Math.max(0, number(fillQuantity, 0));
  const arrival = number(arrivalPrice);
  const marketReference = number(marketReferencePrice);
  const fill = number(fillPrice);
  const bid = number(bidPrice);
  const ask = number(askPrice);
  const displayed = Math.max(0, number(displayedShares, 0));
  const fee = Math.max(0, number(feeAmount, 0));

  const midpoint = bid > 0 && ask > 0 && ask >= bid ? (bid + ask) / 2 : null;
  const spreadBps = midpoint > 0 ? ((ask - bid) / midpoint) * 10000 : null;

  const arrivalAdverseMove = (
    arrival > 0 &&
    fill > 0
  )
    ? direction * (fill - arrival)
    : null;
  const implementationShortfallBps = safeBps(arrivalAdverseMove, arrival);

  const topOfBookAdverseMove = (
    marketReference > 0 &&
    fill > 0
  )
    ? direction * (fill - marketReference)
    : null;
  const topOfBookSlippageBps = safeBps(topOfBookAdverseMove, marketReference);

  const fillNotional = fillQty > 0 && fill > 0 ? fillQty * fill : null;
  const feeBps = fillNotional > 0 ? (fee / fillNotional) * 10000 : null;
  const totalExecutionCostBps = (
    implementationShortfallBps !== null ||
    feeBps !== null
  )
    ? Math.max(0, implementationShortfallBps || 0) + Math.max(0, feeBps || 0)
    : null;

  return {
    side: normalizedSide,
    order_quantity: orderQty,
    fill_quantity: fillQty,
    slice_fill_ratio: orderQty > 0 ? fillQty / orderQty : null,
    arrival_price: arrival,
    market_reference_price: marketReference,
    fill_price: fill,
    bid_price: bid,
    ask_price: ask,
    midpoint_price: midpoint,
    spread_bps: spreadBps,
    top_of_book_slippage_bps: topOfBookSlippageBps,
    implementation_shortfall_bps: implementationShortfallBps,
    fee_bps: feeBps,
    total_execution_cost_bps: totalExecutionCostBps,
    displayed_shares: displayed,
    displayed_liquidity_participation: displayed > 0 ? fillQty / displayed : null,
  };
}

export function summarizeExecutionQuality(fills = []) {
  const rows = (Array.isArray(fills) ? fills : [])
    .map((fill) => ({
      fill,
      quality: fill?.metadata?.execution_quality || null,
    }))
    .filter(({ quality }) => quality && typeof quality === "object");

  if (!rows.length) {
    return {
      sample_count: 0,
      fill_notional: 0,
      avg_implementation_shortfall_bps: null,
      avg_top_of_book_slippage_bps: null,
      avg_spread_bps: null,
      avg_total_execution_cost_bps: null,
      avg_displayed_liquidity_participation: null,
    };
  }

  const weightedAverage = (key) => {
    let numerator = 0;
    let denominator = 0;
    for (const { fill, quality } of rows) {
      const value = number(quality?.[key]);
      const weight = Math.max(0, number(fill?.notional, 0));
      if (value === null || !(weight > 0)) continue;
      numerator += value * weight;
      denominator += weight;
    }
    return denominator > 0 ? numerator / denominator : null;
  };

  const fillNotional = rows.reduce(
    (sum, { fill }) => sum + Math.max(0, number(fill?.notional, 0)),
    0,
  );

  return {
    sample_count: rows.length,
    fill_notional: fillNotional,
    avg_implementation_shortfall_bps: weightedAverage("implementation_shortfall_bps"),
    avg_top_of_book_slippage_bps: weightedAverage("top_of_book_slippage_bps"),
    avg_spread_bps: weightedAverage("spread_bps"),
    avg_total_execution_cost_bps: weightedAverage("total_execution_cost_bps"),
    avg_displayed_liquidity_participation: weightedAverage("displayed_liquidity_participation"),
  };
}
