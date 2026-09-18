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

function executionMarketDataIdentity({ snapshot, order, maxAgeSeconds = 120, now = new Date() }) {
  const fingerprint = text(snapshot?.latest_quote_fingerprint).toLowerCase();
  const quoteAt = snapshot?.latest_quote_at || null;
  const quoteMs = new Date(quoteAt || 0).getTime();
  const nowMs = new Date(now).getTime();
  const priorQuoteMs = new Date(order?.last_execution_quote_at || 0).getTime();
  const ageSeconds = Number.isFinite(quoteMs) && Number.isFinite(nowMs)
    ? (nowMs - quoteMs) / 1000
    : Number.POSITIVE_INFINITY;
  const reasons = [];
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) reasons.push("EXECUTION_QUOTE_FINGERPRINT_REQUIRED");
  if (!Number.isFinite(quoteMs) || quoteMs <= 0) reasons.push("EXECUTION_QUOTE_TIMESTAMP_REQUIRED");
  if (Number.isFinite(ageSeconds) && ageSeconds < -5) reasons.push("EXECUTION_QUOTE_FROM_FUTURE");
  if (!Number.isFinite(ageSeconds) || ageSeconds > maxAgeSeconds) reasons.push("EXECUTION_QUOTE_STALE");
  if (fingerprint && fingerprint === text(order?.last_execution_quote_fingerprint).toLowerCase()) {
    reasons.push("EXECUTION_QUOTE_ALREADY_CONSUMED");
  }
  if (
    Number.isFinite(priorQuoteMs) && priorQuoteMs > 0 &&
    Number.isFinite(quoteMs) && quoteMs <= priorQuoteMs
  ) {
    reasons.push("EXECUTION_QUOTE_NOT_MONOTONIC");
  }
  return {
    approved: reasons.length === 0,
    reasons,
    provider: snapshot?.provider || null,
    feed: snapshot?.feed || null,
    snapshot_id: snapshot?.id || null,
    quote_at: quoteAt,
    quote_fingerprint: fingerprint || null,
    quote_age_seconds: Number.isFinite(ageSeconds) ? ageSeconds : null,
  };
}

async function latestSnapshot({ organizationId, portfolioId, symbol }) {
  const ticker = text(symbol).toUpperCase();
  const { data, error } = await supabaseAdmin
    .from("market_live_snapshots")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .eq("symbol", ticker)
    .not("latest_quote_fingerprint", "is", null)
    .order("latest_quote_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function executionFeedAuthority({
  organizationId,
  portfolioId,
  symbol,
  snapshot,
  maxAgeSeconds = 120,
  now = new Date(),
}) {
  const provider = text(snapshot?.provider).toLowerCase();
  const feed = text(snapshot?.feed).toLowerCase();
  const transport = text(snapshot?.provenance?.transport).toLowerCase();
  const { data: status, error } = await supabaseAdmin
    .from("market_feed_status")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .eq("provider", provider)
    .eq("feed", feed)
    .maybeSingle();
  if (error) throw error;

  const nowMs = new Date(now).getTime();
  const stockMessageMs = new Date(status?.last_stock_message_at || 0).getTime();
  const stockFlushMs = new Date(status?.last_stock_flush_at || 0).getTime();
  const quoteMs = new Date(snapshot?.latest_quote_at || 0).getTime();
  const updatedMs = new Date(status?.updated_at || 0).getTime();
  const age = (value) => Number.isFinite(value) && Number.isFinite(nowMs)
    ? (nowMs - value) / 1000
    : Number.POSITIVE_INFINITY;
  const reasons = [];
  if (!snapshot?.id) reasons.push("EXECUTION_LIVE_SNAPSHOT_REQUIRED");
  if (transport !== "websocket") reasons.push("EXECUTION_WEBSOCKET_TRANSPORT_REQUIRED");
  if (!status) reasons.push("EXECUTION_FEED_STATUS_REQUIRED");
  if (status?.metadata?.stock_stream_ready !== true) reasons.push("EXECUTION_STOCK_STREAM_NOT_READY");
  if (!Array.isArray(status?.subscribed_symbols) || !status.subscribed_symbols.includes(text(symbol).toUpperCase())) {
    reasons.push("EXECUTION_SYMBOL_NOT_SUBSCRIBED");
  }
  if (!Number.isFinite(stockMessageMs) || age(stockMessageMs) > maxAgeSeconds) {
    reasons.push("EXECUTION_STOCK_HEARTBEAT_STALE");
  }
  if (!Number.isFinite(stockFlushMs) || age(stockFlushMs) > maxAgeSeconds) {
    reasons.push("EXECUTION_STOCK_FLUSH_STALE");
  }
  if (!Number.isFinite(updatedMs) || age(updatedMs) > maxAgeSeconds) {
    reasons.push("EXECUTION_FEED_STATUS_STALE");
  }
  if (Number.isFinite(quoteMs) && Number.isFinite(stockFlushMs) && stockFlushMs < quoteMs) {
    reasons.push("EXECUTION_QUOTE_NOT_FLUSH_CONFIRMED");
  }

  return {
    approved: reasons.length === 0,
    reasons,
    provider: provider || null,
    feed: feed || null,
    transport: transport || null,
    connection_state: status?.connection_state || null,
    stock_stream_ready: status?.metadata?.stock_stream_ready === true,
    news_stream_ready: status?.metadata?.news_stream_ready === true,
    last_stock_message_at: status?.last_stock_message_at || null,
    last_stock_flush_at: status?.last_stock_flush_at || null,
    feed_status_updated_at: status?.updated_at || null,
    max_age_seconds: maxAgeSeconds,
  };
}

function governedPaperExecutionModel(order) {
  const model = order?.metadata?.paper_execution_model;
  const version = number(model?.version);
  const slippageBps = number(model?.slippage_bps);
  const feeAmount = number(model?.fee_amount);
  const maxQuoteParticipation = number(model?.max_quote_participation);
  const quoteRoundLotSize = number(model?.quote_round_lot_size);
  const feeModel = text(model?.fee_model).toUpperCase();

  if (
    version !== 1 ||
    !(slippageBps >= 0 && slippageBps <= 1000) ||
    feeModel !== "ZERO_COMMISSION" ||
    feeAmount !== 0 ||
    !(maxQuoteParticipation > 0 && maxQuoteParticipation <= 0.25) ||
    quoteRoundLotSize !== 100
  ) {
    return {
      approved: false,
      reason: "PAPER_EXECUTION_MODEL_INVALID",
      model: model || null,
    };
  }

  return {
    approved: true,
    version,
    slippage_bps: slippageBps,
    fee_model: feeModel,
    fee_amount: feeAmount,
    max_quote_participation: maxQuoteParticipation,
    quote_round_lot_size: quoteRoundLotSize,
  };
}

function executableMarketPrice(order, snapshot) {
  if (!snapshot) throw new Error("PAPER_MARKET_SNAPSHOT_REQUIRED");
  const side = text(order?.side).toUpperCase();
  if (side === "BUY") return number(snapshot.ask_price);
  if (side === "SELL") return number(snapshot.bid_price);
  throw new Error("PAPER_ORDER_SIDE_INVALID");
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
      .select("circuit_breaker_latched,kill_switch,updated_at")
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
}) {
  if (!order?.id) throw new Error("paper order required");
  if (!["QUEUED", "PARTIALLY_FILLED"].includes(order.status)) {
    return { filled: false, reason: "ORDER_NOT_FILLABLE", order };
  }

  const executionModel = governedPaperExecutionModel(order);
  if (!executionModel.approved) {
    return {
      filled: false,
      reason: executionModel.reason,
      execution_model: executionModel.model,
      order,
    };
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
  if (!snapshot) {
    return {
      filled: false,
      reason: "EXECUTION_LIVE_SNAPSHOT_REQUIRED",
      order,
    };
  }

  const executionState = await loadExecutionRiskState({
    organizationId,
    portfolioId,
  });
  const maxMarketDataAgeSeconds = number(
    executionState.policy?.max_market_data_age_seconds,
    120,
  );
  const feedAuthority = await executionFeedAuthority({
    organizationId,
    portfolioId,
    symbol: order.symbol,
    snapshot,
    maxAgeSeconds: maxMarketDataAgeSeconds,
  });
  if (!feedAuthority.approved) {
    return {
      filled: false,
      reason: "EXECUTION_FEED_AUTHORITY_FAILED",
      reasons: feedAuthority.reasons,
      feed_authority: feedAuthority,
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
    maxQuoteParticipation: executionModel.max_quote_participation,
    roundLotSize: executionModel.quote_round_lot_size,
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
    slippageBps: executionModel.slippage_bps,
    orderType: order.order_type,
    limitPrice: order.limit_price,
  });

  const side = text(order.side).toUpperCase();
  const marketDataIdentity = executionMarketDataIdentity({
    snapshot,
    order,
    maxAgeSeconds: maxMarketDataAgeSeconds,
  });
  if (!marketDataIdentity.approved) {
    return {
      filled: false,
      reason: "EXECUTION_MARKET_DATA_IDENTITY_FAILED",
      reasons: marketDataIdentity.reasons,
      market_data_identity: marketDataIdentity,
      order,
      snapshot_id: snapshot?.id || null,
    };
  }

  if (executionState.automation?.kill_switch === true) {
    return {
      filled: false,
      reason: "PAPER_AUTOMATION_KILL_SWITCH_ACTIVE",
      order,
      snapshot_id: snapshot?.id || null,
    };
  }

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
    ...(feedAuthority.reasons || []),
    ...(marketDataIdentity.reasons || []),
    ...(executionRisk.reasons || []),
    ...(portfolioRisk.reasons || []),
    ...(microstructureRisk.reasons || []),
    ...(corporateActionRisk.reasons || []),
  ];
  const riskRevalidation = {
    approved:
      feedAuthority.approved &&
      marketDataIdentity.approved &&
      executionRisk.approved &&
      portfolioRisk.approved &&
      microstructureRisk.approved &&
      corporateActionRisk.approved,
    evaluated_at: new Date().toISOString(),
    execution_revision: number(account.execution_revision, 0),
    risk_policy_revision: executionState.policy?.updated_at || null,
    automation_policy_revision: executionState.automation?.updated_at || null,
    automation_state: {
      kill_switch: executionState.automation?.kill_switch === true,
      circuit_breaker_latched: executionState.automation?.circuit_breaker_latched === true,
    },
    reasons: revalidationReasons,
    feed_authority: feedAuthority,
    market_data_identity: marketDataIdentity,
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

  const finalSessionSafety = await MarketSessionSafetyRuntime.evaluate({
    organizationId,
    symbol: order.symbol,
    allowExtendedHours: false,
  });
  if (!finalSessionSafety.approved) {
    return {
      filled: false,
      reason: "FINAL_MARKET_SESSION_INELIGIBLE",
      reasons: finalSessionSafety.reasons,
      session: finalSessionSafety.metrics,
      order,
      snapshot_id: snapshot?.id || null,
    };
  }

  const totalOrderQuantity = Math.max(number(order.quantity, 0), liquidity.executable_quantity);
  const sliceFeeAmount = executionModel.fee_amount
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
    execution_model: executionModel,
    final_session_revalidation: {
      evaluated_at: new Date().toISOString(),
      metrics: finalSessionSafety.metrics,
      clock_timestamp: finalSessionSafety.clock?.timestamp || null,
      clock_provenance: finalSessionSafety.clock?.provenance || null,
      asset_id: finalSessionSafety.asset?.id || null,
      asset_status: finalSessionSafety.asset?.status || null,
      asset_tradable: finalSessionSafety.asset?.tradable === true,
    },
    risk_revalidation: riskRevalidation,
  };

  const { data, error } = await supabaseAdmin.rpc("market_apply_paper_fill_with_quality", {
    p_organization_id: organizationId,
    p_order_id: order.id,
    p_fill_quantity: liquidity.executable_quantity,
    p_fill_price: fillPrice,
    p_fee_amount: sliceFeeAmount,
    p_slippage_bps: executionModel.slippage_bps,
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
      slippage_bps: executionModel.slippage_bps,
      fee_amount: sliceFeeAmount,
      execution_model_version: executionModel.version,
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
