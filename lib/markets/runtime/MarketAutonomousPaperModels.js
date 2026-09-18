function number(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function calculateAutonomousPaperOrder({
  decision,
  automationPolicy,
  riskPolicy,
  account,
  position = null,
  marketPrice,
  candidateAnnualizedVolatilityPct = null,
}) {
  const action = String(decision?.action || "").toUpperCase();
  const price = number(marketPrice);
  const equity = number(account?.equity);
  const cash = number(account?.cash_balance);
  const heldQuantity = number(position?.quantity);
  const confidence = number(decision?.confidence);
  const automationFloor = number(automationPolicy?.min_confidence, 0.75);
  const riskFloor = number(riskPolicy?.min_decision_confidence, 0.7);
  const minimumConfidence = Math.max(automationFloor, riskFloor);

  if (automationPolicy?.kill_switch === true) {
    return { executable: false, reason: "AUTOMATION_KILL_SWITCH" };
  }
  if (automationPolicy?.auto_paper_enabled !== true) {
    return { executable: false, reason: "AUTO_PAPER_DISABLED" };
  }
  if (!["BUY", "SELL"].includes(action)) {
    return { executable: false, reason: "NON_EXECUTABLE_DECISION" };
  }
  if (confidence < minimumConfidence) {
    return { executable: false, reason: "CONFIDENCE_BELOW_AUTOMATION_FLOOR" };
  }
  if (!(price > 0) || !(equity > 0)) {
    return { executable: false, reason: "INVALID_MARKET_STATE" };
  }
  if (action === "BUY" && automationPolicy?.allow_buys === false) {
    return { executable: false, reason: "AUTOMATED_BUYS_DISABLED" };
  }
  if (action === "SELL" && automationPolicy?.allow_sells === false) {
    return { executable: false, reason: "AUTOMATED_SELLS_DISABLED" };
  }

  const targetPct = clamp(
    number(automationPolicy?.target_position_pct, 2),
    0.1,
    number(riskPolicy?.max_position_pct, 10),
  );
  const confidenceScale = clamp(
    (confidence - minimumConfidence) / Math.max(1 - minimumConfidence, 0.0001),
    0,
    1,
  );
  const confidenceScaledTargetPct = targetPct * (0.5 + (confidenceScale * 0.5));
  const candidateVolatility = number(candidateAnnualizedVolatilityPct, null);
  const volatilityTarget = Math.max(
    1,
    number(automationPolicy?.target_annualized_volatility_pct, 25),
  );
  const volatilityScale = candidateVolatility !== null && candidateVolatility > 0
    ? clamp(volatilityTarget / candidateVolatility, 0.1, 1)
    : 1;
  const scaledTargetPct = confidenceScaledTargetPct * volatilityScale;
  const targetValue = equity * (scaledTargetPct / 100);
  const heldValue = heldQuantity * price;

  if (action === "BUY") {
    const desiredNotional = Math.max(0, targetValue - heldValue);
    const cappedByCash = Math.min(desiredNotional, cash);
    const maxOrderNotional = number(riskPolicy?.max_order_notional);
    const finalNotional = maxOrderNotional > 0
      ? Math.min(cappedByCash, maxOrderNotional)
      : cappedByCash;
    const quantity = finalNotional / price;

    if (!(quantity > 0)) {
      return { executable: false, reason: "TARGET_POSITION_ALREADY_REACHED" };
    }

    return {
      executable: true,
      side: "BUY",
      quantity,
      notional: finalNotional,
      market_price: price,
      target_position_pct: scaledTargetPct,
      confidence_scaled_target_position_pct: confidenceScaledTargetPct,
      candidate_annualized_volatility_pct: candidateVolatility,
      target_annualized_volatility_pct: volatilityTarget,
      volatility_scale: volatilityScale,
      confidence,
      minimum_confidence: minimumConfidence,
    };
  }

  if (!(heldQuantity > 0)) {
    return { executable: false, reason: "NO_LONG_POSITION_TO_SELL" };
  }

  return {
    executable: true,
    side: "SELL",
    quantity: heldQuantity,
    notional: heldQuantity * price,
    market_price: price,
    target_position_pct: 0,
    confidence,
    minimum_confidence: minimumConfidence,
  };
}

export function applyPortfolioRiskBudgetToSizing({
  sizing,
  riskBudget,
  equity,
  heldValue = 0,
}) {
  if (!sizing?.executable || String(sizing?.side || "").toUpperCase() !== "BUY") {
    return sizing;
  }

  const scale = clamp(number(riskBudget?.scale, 1), 0, 1);
  const originalNotional = Math.max(0, number(sizing.notional));
  const adjustedNotional = originalNotional * scale;
  const price = number(sizing.market_price);
  const accountEquity = number(equity);

  if (!(adjustedNotional > 0) || !(price > 0)) {
    return {
      ...sizing,
      executable: false,
      reason: "RISK_BUDGET_REDUCED_ORDER_TO_ZERO",
      risk_budget_scale: scale,
    };
  }

  const projectedValue = Math.max(0, number(heldValue)) + adjustedNotional;

  return {
    ...sizing,
    quantity: adjustedNotional / price,
    notional: adjustedNotional,
    target_position_pct: accountEquity > 0
      ? (projectedValue / accountEquity) * 100
      : sizing.target_position_pct,
    pre_risk_budget_notional: originalNotional,
    risk_budget_scale: scale,
    risk_budget_binding_dimension: riskBudget?.binding_dimension || null,
    risk_budget_max_utilization: number(riskBudget?.max_utilization, null),
    risk_budget_utilizations: riskBudget?.utilizations || {},
  };
}

export function researchRefreshRequired({
  lastResearchAt,
  now = new Date(),
  maxAgeMinutes = 360,
}) {
  const lastMs = new Date(lastResearchAt || 0).getTime();
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(lastMs) || lastMs <= 0) return true;
  if (!Number.isFinite(nowMs)) return true;
  return (nowMs - lastMs) >= (Math.max(1, number(maxAgeMinutes, 360)) * 60 * 1000);
}
