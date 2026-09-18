function number(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function calculatePaperExecutableQuantity({
  side,
  remainingQuantity,
  snapshot,
  maxQuoteParticipation = 0.25,
  roundLotSize = 100,
}) {
  const remaining = Math.max(0, number(remainingQuantity));
  if (!(remaining > 0)) {
    return {
      executable_quantity: 0,
      displayed_shares: 0,
      quote_size_round_lots: 0,
      participation_rate: 0,
      liquidity_available: false,
    };
  }

  const normalizedSide = String(side || "").toUpperCase();
  const quoteSize = normalizedSide === "SELL"
    ? number(snapshot?.bid_size)
    : number(snapshot?.ask_size);
  const participation = Math.min(1, Math.max(0, number(maxQuoteParticipation, 0.25)));
  const lotSize = Math.max(1, number(roundLotSize, 100));

  if (!(quoteSize > 0)) {
    return {
      executable_quantity: 0,
      displayed_shares: 0,
      quote_size_round_lots: quoteSize || 0,
      participation_rate: participation,
      liquidity_available: false,
    };
  }

  const displayedShares = quoteSize * lotSize;
  const participationCap = displayedShares * participation;
  const executable = Math.min(remaining, participationCap);
  const rounded = Math.floor((executable + Number.EPSILON) * 1e8) / 1e8;

  return {
    executable_quantity: rounded,
    displayed_shares: displayedShares,
    quote_size_round_lots: quoteSize,
    participation_rate: displayedShares > 0 ? rounded / displayedShares : 0,
    liquidity_available: rounded > 0,
  };
}

export function simulatePaperFillPrice({
  side,
  marketPrice,
  slippageBps = 5,
}) {
  const price = number(marketPrice);
  if (!(price > 0)) throw new Error("market price must be greater than zero");
  const bps = Math.max(0, number(slippageBps));
  const multiplier = String(side).toUpperCase() === "SELL"
    ? 1 - (bps / 10000)
    : 1 + (bps / 10000);
  return price * multiplier;
}

export function applyPaperFillState({
  account,
  position = null,
  side,
  quantity,
  fillPrice,
  feeAmount = 0,
}) {
  const normalizedSide = String(side || "").toUpperCase();
  if (!["BUY", "SELL"].includes(normalizedSide)) throw new Error("invalid fill side");

  const qty = number(quantity);
  const price = number(fillPrice);
  const fee = Math.max(0, number(feeAmount));
  if (!(qty > 0) || !(price > 0)) throw new Error("quantity and fill price must be greater than zero");

  const cash = number(account?.cash_balance);
  const oldQty = number(position?.quantity);
  const oldAverage = number(position?.average_entry_price, 0);
  const oldRealized = number(position?.realized_pnl, 0);
  const accountRealized = number(account?.realized_pnl, 0);

  if (normalizedSide === "BUY") {
    const totalCost = (qty * price) + fee;
    if (cash < totalCost) throw new Error("INSUFFICIENT_PAPER_CASH");
    const newQty = oldQty + qty;
    const priorCost = oldQty * oldAverage;
    const averageEntryPrice = (priorCost + totalCost) / newQty;

    return {
      account: {
        ...account,
        cash_balance: cash - totalCost,
        realized_pnl: accountRealized,
      },
      position: {
        ...position,
        quantity: newQty,
        average_entry_price: averageEntryPrice,
        realized_pnl: oldRealized,
      },
      realized_pnl_delta: 0,
      notional: qty * price,
    };
  }

  if (qty > oldQty) throw new Error("INSUFFICIENT_PAPER_POSITION");

  const grossProceeds = qty * price;
  const grossRealized = (price - oldAverage) * qty;
  const realizedPnlDelta = grossRealized - fee;
  const newQty = oldQty - qty;

  return {
    account: {
      ...account,
      cash_balance: cash + grossProceeds - fee,
      realized_pnl: accountRealized + realizedPnlDelta,
    },
    position: {
      ...position,
      quantity: newQty,
      average_entry_price: newQty > 0 ? oldAverage : null,
      realized_pnl: oldRealized + realizedPnlDelta,
    },
    realized_pnl_delta: realizedPnlDelta,
    notional: grossProceeds,
  };
}

export function markPaperPosition({
  position,
  marketPrice,
}) {
  const qty = number(position?.quantity);
  const price = number(marketPrice);
  const average = number(position?.average_entry_price);
  const marketValue = qty * price;
  const unrealized = qty > 0 && average > 0
    ? (price - average) * qty
    : 0;

  return {
    ...position,
    market_price: price || null,
    market_value: marketValue,
    unrealized_pnl: unrealized,
  };
}

export function calculatePaperAccountEquity({
  account,
  positions = [],
}) {
  const cash = number(account?.cash_balance);
  const marketValue = positions.reduce(
    (sum, position) => sum + number(position?.market_value),
    0,
  );
  const unrealized = positions.reduce(
    (sum, position) => sum + number(position?.unrealized_pnl),
    0,
  );

  return {
    ...account,
    equity: cash + marketValue,
    unrealized_pnl: unrealized,
  };
}
