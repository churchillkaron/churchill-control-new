import { MarketCorporateActionRiskRuntime } from "@/lib/markets/runtime/MarketCorporateActionRiskRuntime";
import { calculateExecutionQuality } from "@/lib/markets/runtime/MarketExecutionQualityModels";
import { evaluateMarketMicrostructureRisk } from "@/lib/markets/runtime/MarketMicrostructureRiskModels";
import {
  calculatePaperExecutableQuantity,
  simulatePaperFillPrice,
} from "@/lib/markets/runtime/MarketPaperExecutionModels";
import { evaluatePaperOrderLifecycle } from "@/lib/markets/runtime/MarketPaperOrderLifecycleModels";
import { MarketPortfolioPerformanceRuntime } from "@/lib/markets/runtime/MarketPortfolioPerformanceRuntime";
import { MarketPortfolioRiskRuntime } from "@/lib/markets/runtime/MarketPortfolioRiskRuntime";
import { evaluatePaperTradeRisk } from "@/lib/markets/runtime/MarketRiskPolicyRuntime";
import { MarketSessionSafetyRuntime } from "@/lib/markets/runtime/MarketSessionSafetyRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function latestSnapshot({ organizationId, portfolioId, symbol }) {
  const ticker = text(symbol).toUpperCase();
  const { data: live, error: liveError } = await supabaseAdmin
    .from("market_live_snapshots")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .eq("symbol", ticker)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (liveError) throw liveError;
  if (live) return live;

  const { data, error } = await supabaseAdmin
    .from("market_snapshots")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .eq("symbol", ticker)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function executableMarketPrice(order, snapshot) {
  if (!snapshot) throw new Error("PAPER_MARKET_SNAPSHOT_REQUIRED");
  const side = text(order?.side).toUpperCase();
  if (side === "BUY") {
    return number(snapshot.ask_price)
      ?? number(snapshot.latest_trade_price)
      ?? number(snapshot.minute_close)
      ?? number(snapshot.day_close);
  }
  return number(snapshot.bid_price)
    ?? number(snapshot.latest_trade_price)
    ?? number(snapshot.minute_close)
    ?? number(snapshot.day_close);
}

function limitCanFill(order, marketPrice) {
  if (text(order?.order_type).toUpperCase() !== "LIMIT") return true;
  const limit = number(order?.limit_price);
  if (!(limit > 0)) return false;
  return text(order?.side).toUpperCase() === "BUY"
    ? marketPrice <= limit
    : marketPrice >= limit;
}

async function loadExecutionRiskState({ organizationId, portfolioId }) {
  const [policyResult, automationResult, accountResult, positionsResult] = await Promise.all([
    supabaseAdmin
      .from("market_risk_policies")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .maybeSingle(),
    supabaseAdmin
      .from("market_automation_policies")
      .select("circuit_breaker_latched")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .maybeSingle(),
    supabaseAdmin
      .from("market_paper_accounts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .maybeSingle(),
    supabaseAdmin
      .from("market_paper_positions")
      .select("id,symbol,quantity,market_price,market_value,updated_at")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId),
  ]);

  for (const result of [policyResult, automationResult, accountResult, positionsResult]) {
    if (result.error) throw result.error;
  }

  return {
    policy: policyResult.data || {},
    automation: automationResult.data || {},
    account: accountResult.data || null,
    positions: positionsResult.data || [],
  };
}

export async function processPaperOrder({
  organizationId,
  portfolioId,
  order,
  slippageBps = 5,
  feeAmount = 0,
}) {
  if (!order?.id) throw new Error("paper order required");
  if (!["QUEUED", "PARTIALLY_FILLED"].includes(order.status)) {
    return { filled: false, reason: "ORDER_NOT_FILLABLE", order };
  }

  let decision = null;
  if (order.decision_id) {
    const { data, error } = await supabaseAdmin
      .from("market_decisions")
      .select("id,symbol,action,confidence,expires_at,risk_status,invalidation_reason,superseded_by_decision_id")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .eq("id", order.decision_id)
      .maybeSingle();
    if (error) throw error;
    decision = data || null;
  }

  if (!decision || decision.risk_status !== "APPROVED_PAPER") {
    const terminalDecisionStatus = decision?.risk_status || "MISSING";
    const lifecycleReason = terminalDecisionStatus === "SUPERSEDED"
      ? "GOVERNED_DECISION_SUPERSEDED"
      : terminalDecisionStatus === "CANCELLED"
        ? "GOVERNED_DECISION_CANCELLED"
        : "GOVERNED_DECISION_NOT_APPROVED";
    let cancelledOrder = order;
    if (["SUPERSEDED", "CANCELLED"].includes(terminalDecisionStatus)) {
      const cancelledAt = new Date().toISOString();
      const { data: cancelled, error: cancelError } = await supabaseAdmin
        .from("market_paper_orders")
        .update({
          status: "CANCELLED",
          cancelled_at: cancelledAt,
          cancellation_reason: lifecycleReason,
          lifecycle_reason: lifecycleReason,
        })
        .eq("organization_id", organizationId)
        .eq("portfolio_id", portfolioId)
        .eq("id", order.id)
        .in("status", ["QUEUED", "PARTIALLY_FILLED"])
        .select("*")
        .maybeSingle();
      if (cancelError) throw cancelError;
      cancelledOrder = cancelled || { ...order, status: "CANCELLED" };
    }
    return {
      filled: false,
      reason: lifecycleReason,
      order: cancelledOrder,
      decision_id: order.decision_id || null,
      decision_status: terminalDecisionStatus,
      invalidation_reason: decision?.invalidation_reason || null,
      superseded_by_decision_id: decision?.superseded_by_decision_id || null,
    };
  }
  if (
    text(decision.symbol).toUpperCase() !== text(order.symbol).toUpperCase() ||
    text(decision.action).toUpperCase() !== text(order.side).toUpperCase()
  ) {
    return {
      filled: false,
      reason: "ORDER_DECISION_MUTATION_MISMATCH",
      order,
      decision_id: decision.id,
      decision_symbol: decision.symbol,
      decision_action: decision.action,
    };
  }

  const lifecycle = evaluatePaperOrderLifecycle({
    order,
    decision,
    now: new Date(),
  });
  if (!lifecycle.active) {
    const expiredAt = new Date().toISOString();
    const { data: expiredOrder, error: expiryError } = await supabaseAdmin
      .from("market_paper_orders")
      .update({
        status: "EXPIRED",
        expired_at: expiredAt,
        lifecycle_reason: lifecycle.reason,
      })
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .eq("id", order.id)
      .in("status", ["QUEUED", "PARTIALLY_FILLED"])
      .select("*")
      .maybeSingle();
    if (expiryError) throw expiryError;

    if (decision?.id && lifecycle.reason === "GOVERNED_DECISION_EXPIRED") {
      await supabaseAdmin
        .from("market_decisions")
        .update({ risk_status: "EXPIRED" })
        .eq("organization_id", organizationId)
        .eq("id", decision.id)
        .eq("risk_status", "APPROVED_PAPER");
    }

    return {
      filled: false,
      reason: lifecycle.reason,
      order: expiredOrder || { ...order, status: "EXPIRED", expired_at: expiredAt },
    };
  }

  const sessionSafety = await MarketSessionSafetyRuntime.evaluate({
    organizationId,
    symbol: order.symbol,
    allowExtendedHours: false,
  });
  if (!sessionSafety.approved) {
    return {
      filled: false,
      reason: "MARKET_SESSION_INELIGIBLE",
      reasons: sessionSafety.reasons,
      session: sessionSafety.metrics,
      order,
    };
  }

  const snapshot = await latestSnapshot({
    organizationId,
    portfolioId,
    symbol: order.symbol,
  });
  if (snapshot?.id && order.last_execution_snapshot_id === snapshot.id) {
    return {
      filled: false,
      reason: "NO_NEW_LIQUIDITY_SNAPSHOT",
      order,
      snapshot_id: snapshot.id,
    };
  }

  const marketPrice = executableMarketPrice(order, snapshot);
  if (!(marketPrice > 0)) throw new Error("PAPER_MARKET_PRICE_UNAVAILABLE");

  if (!limitCanFill(order, marketPrice)) {
    return {
      filled: false,
      reason: "LIMIT_NOT_MARKETABLE",
      order,
      market_price: marketPrice,
    };
  }

  const remainingQuantity = number(
    order.remaining_quantity,
    number(order.quantity, 0) - number(order.filled_quantity, 0),
  );
  const liquidity = calculatePaperExecutableQuantity({
    side: order.side,
    remainingQuantity,
    snapshot,
    maxQuoteParticipation: 0.25,
    roundLotSize: 100,
  });
  if (!liquidity.liquidity_available || !(liquidity.executable_quantity > 0)) {
    return {
      filled: false,
      reason: "QUOTE_LIQUIDITY_UNAVAILABLE",
      order,
      snapshot_id: snapshot?.id || null,
      liquidity,
    };
  }

  const fillPrice = simulatePaperFillPrice({
    side: order.side,
    marketPrice,
    slippageBps,
  });

  const executionState = await loadExecutionRiskState({
    organizationId,
    portfolioId,
  });
  const side = text(order.side).toUpperCase();

  if (side === "BUY" && executionState.automation?.circuit_breaker_latched === true) {
    return {
      filled: false,
      reason: "PORTFOLIO_CIRCUIT_BREAKER_LATCHED",
      order,
      snapshot_id: snapshot?.id || null,
    };
  }

  const account = executionState.account;
  if (!account) {
    return {
      filled: false,
      reason: "PAPER_ACCOUNT_REQUIRED",
      order,
    };
  }

  const markedPositions = executionState.positions.map((position) => {
    const ticker = text(position.symbol).toUpperCase();
    const quantityHeld = number(position.quantity, 0);
    const mark = ticker === text(order.symbol).toUpperCase()
      ? marketPrice
      : number(position.market_price, 0);
    return {
      ...position,
      symbol: ticker,
      market_price: mark,
      market_value: quantityHeld * mark,
    };
  });

  const markedPositionsValue = markedPositions.reduce(
    (sum, position) => sum + number(position.market_value, 0),
    0,
  );
  const equity = number(account.cash_balance, 0) + markedPositionsValue;
  const dailyEquityStart = number(account.daily_equity_start, equity);
  const highWaterEquity = Math.max(number(account.high_water_equity, equity), equity);
  const dailyPnl = equity - dailyEquityStart;
  const drawdownPct = highWaterEquity > 0
    ? Math.max(0, ((highWaterEquity - equity) / highWaterEquity) * 100)
    : 0;
  const currentPosition = markedPositions.find(
    (position) => position.symbol === text(order.symbol).toUpperCase(),
  ) || null;
  const fillNotional = liquidity.executable_quantity * fillPrice;

  const executionRisk = evaluatePaperTradeRisk({
    policy: executionState.policy,
    decision,
    portfolio: {
      equity,
      current_position_value: number(currentPosition?.market_value, 0),
      daily_pnl: dailyPnl,
      drawdown_pct: drawdownPct,
    },
    order: {
      side,
      notional: fillNotional,
    },
  });
  const portfolioRisk = await MarketPortfolioRiskRuntime.evaluate({
    organizationId,
    portfolioId,
    policy: executionState.policy,
    equity,
    positions: markedPositions,
    proposed: {
      symbol: order.symbol,
      side,
      notional: fillNotional,
    },
  });
  const microstructureRisk = evaluateMarketMicrostructureRisk({
    policy: executionState.policy,
    snapshot,
    side,
  });
  const corporateActionRisk = await MarketCorporateActionRiskRuntime.evaluate({
    organizationId,
    portfolioId,
    symbol: order.symbol,
    policy: executionState.policy,
    side,
  });

  const revalidationReasons = [
    ...(executionRisk.reasons || []),
    ...(portfolioRisk.reasons || []),
    ...(microstructureRisk.reasons || []),
    ...(corporateActionRisk.reasons || []),
  ];
  const riskRevalidation = {
    approved:
      executionRisk.approved &&
      portfolioRisk.approved &&
      microstructureRisk.approved &&
      corporateActionRisk.approved,
    evaluated_at: new Date().toISOString(),
    execution_revision: number(account.execution_revision, 0),
    reasons: revalidationReasons,
    execution_risk: executionRisk.snapshot || {},
    portfolio_risk: portfolioRisk.metrics || {},
    market_microstructure: microstructureRisk.metrics || {},
    corporate_action_risk: corporateActionRisk.metrics || {},
  };
  if (!riskRevalidation.approved) {
    return {
      filled: false,
      reason: "EXECUTION_RISK_REVALIDATION_FAILED",
      reasons: revalidationReasons,
      order,
      snapshot_id: snapshot?.id || null,
      revalidation: riskRevalidation,
    };
  }

  const totalOrderQuantity = Math.max(number(order.quantity, 0), liquidity.executable_quantity);
  const sliceFeeAmount = Math.max(0, number(feeAmount, 0))
    * (liquidity.executable_quantity / totalOrderQuantity);
  const executionQuality = {
    ...calculateExecutionQuality({
      side: order.side,
      orderQuantity: order.quantity,
      fillQuantity: liquidity.executable_quantity,
      arrivalPrice: order.requested_price,
      marketReferencePrice: marketPrice,
      fillPrice,
      bidPrice: snapshot?.bid_price,
      askPrice: snapshot?.ask_price,
      displayedShares: liquidity.displayed_shares,
      feeAmount: sliceFeeAmount,
    }),
    risk_revalidation: riskRevalidation,
  };

  const { data, error } = await supabaseAdmin.rpc("market_apply_paper_fill_with_quality", {
    p_organization_id: organizationId,
    p_order_id: order.id,
    p_fill_quantity: liquidity.executable_quantity,
    p_fill_price: fillPrice,
    p_fee_amount: sliceFeeAmount,
    p_slippage_bps: slippageBps,
    p_snapshot_id: snapshot?.id || null,
    p_execution_quality: executionQuality,
  });
  if (error) throw error;

  const equitySnapshot = await MarketPortfolioPerformanceRuntime.recordSnapshot({
    organizationId,
    portfolioId,
    sourceType: "FILL",
    sourceId: data?.fill_id || order.id,
    metadata: {
      order_id: order.id,
      symbol: order.symbol,
      side: order.side,
      fill_quantity: liquidity.executable_quantity,
      fill_price: fillPrice,
      slippage_bps: slippageBps,
      fee_amount: sliceFeeAmount,
      snapshot_id: snapshot?.id || null,
    },
  });

  return {
    filled: true,
    completed: data?.order_status === "FILLED",
    partial: data?.order_status === "PARTIALLY_FILLED",
    result: data,
    liquidity,
    execution_quality: executionQuality,
    equity_snapshot: equitySnapshot,
    snapshot_id: snapshot.id,
    market_price: marketPrice,
    fill_price: fillPrice,
    fill_quantity: liquidity.executable_quantity,
    remaining_quantity: data?.remaining_quantity ?? null,
  };
}

export async function processQueuedPaperOrders({
  organizationId,
  portfolioId,
  slippageBps = 5,
  feeAmount = 0,
  limit = 50,
}) {
  const { data: orders, error } = await supabaseAdmin
    .from("market_paper_orders")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .in("status", ["QUEUED", "PARTIALLY_FILLED"])
    .order("submitted_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  const results = [];
  for (const order of orders || []) {
    try {
      results.push(await processPaperOrder({
        organizationId,
        portfolioId,
        order,
        slippageBps,
        feeAmount,
      }));
    } catch (executionError) {
      results.push({
        filled: false,
        order_id: order.id,
        reason: executionError?.message || "PAPER_EXECUTION_FAILED",
      });
    }
  }

  return {
    processed: results.length,
    execution_slices: results.filter((row) => row.filled).length,
    completed_orders: results.filter((row) => row.completed).length,
    partial_orders: results.filter((row) => row.partial).length,
    results,
  };
}

export const MarketPaperExecutionRuntime = {
  processOrder: processPaperOrder,
  processQueued: processQueuedPaperOrders,
};
