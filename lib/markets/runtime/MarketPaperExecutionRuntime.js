import { MarketCorporateActionRiskRuntime } from "@/lib/markets/runtime/MarketCorporateActionRiskRuntime";
import { evaluateCashReserve } from "@/lib/markets/runtime/MarketCashReserveModels";
import {
  evaluateLossStreakCooloff,
  evaluateOpenPositionLimit,
  evaluateSymbolLossReentryLockout,
} from "@/lib/markets/runtime/MarketExposureDisciplineModels";
import { calculateExecutionQuality } from "@/lib/markets/runtime/MarketExecutionQualityModels";
import { evaluateMarketMicrostructureRisk } from "@/lib/markets/runtime/MarketMicrostructureRiskModels";
import {
  calculatePaperExecutableQuantity,
  simulatePaperFillPrice,
} from "@/lib/markets/runtime/MarketPaperExecutionModels";
import { evaluatePaperOrderLifecycle } from "@/lib/markets/runtime/MarketPaperOrderLifecycleModels";
import { MarketPortfolioPerformanceRuntime } from "@/lib/markets/runtime/MarketPortfolioPerformanceRuntime";
import { MarketPortfolioRiskRuntime } from "@/lib/markets/runtime/MarketPortfolioRiskRuntime";
import { evaluateProtectiveExit } from "@/lib/markets/runtime/MarketProtectiveExitModels";
import { evaluatePaperTradeRisk } from "@/lib/markets/runtime/MarketRiskPolicyRuntime";
import { MarketSessionSafetyRuntime } from "@/lib/markets/runtime/MarketSessionSafetyRuntime";
import { evaluateStrategyDrift } from "@/lib/markets/runtime/MarketStrategyDriftModels";
import { evaluateStrategyReadiness } from "@/lib/markets/runtime/MarketStrategyReadinessModels";
import { summarizeRollingTradingBudget } from "@/lib/markets/runtime/MarketTradingBudgetModels";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function rollingExecutionPaperFills({
  organizationId,
  portfolioId,
  now = new Date(),
}) {
  const end = new Date(now);
  const start = new Date(end.getTime() - (24 * 60 * 60 * 1000));
  const { data, error } = await supabaseAdmin
    .from("market_paper_fills")
    .select("id,order_id,symbol,side,notional,fee_amount,filled_at,metadata")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .gte("filled_at", start.toISOString())
    .lte("filled_at", end.toISOString())
    .order("filled_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data || [];
}

async function recentExecutionSellFills({
  organizationId,
  portfolioId,
  limit = 250,
}) {
  const { data, error } = await supabaseAdmin
    .from("market_paper_fills")
    .select("id,order_id,symbol,side,filled_at,metadata")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .eq("side", "SELL")
    .order("filled_at", { ascending: false })
    .limit(Math.max(10, Math.min(1000, number(limit, 250))));
  if (error) throw error;
  return data || [];
}

async function latestExecutionBacktest({ organizationId, portfolioId, symbol }) {
  const { data, error } = await supabaseAdmin
    .from("market_backtest_runs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .eq("symbol", text(symbol).toUpperCase())
    .eq("strategy_key", "TECHNICAL_QUANT_V1")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function recentExecutionPredictionOutcomes({
  organizationId,
  portfolioId,
  symbol,
  limit = 50,
}) {
  const boundedLimit = Math.max(5, Math.min(500, number(limit, 50)));
  const { data, error } = await supabaseAdmin
    .from("market_prediction_outcomes")
    .select("directional_hit,squared_error,log_loss,excess_return,evaluation_time")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .eq("symbol", text(symbol).toUpperCase())
    .order("evaluation_time", { ascending: false })
    .limit(boundedLimit);
  if (error) throw error;
  return data || [];
}

async function ensureStrategyEvidenceRevision({
  organizationId,
  portfolioId,
  symbol,
}) {
  const { error } = await supabaseAdmin
    .from("market_strategy_evidence_revisions")
    .upsert({
      organization_id: organizationId,
      portfolio_id: portfolioId,
      symbol: text(symbol).toUpperCase(),
      backtest_revision: 0,
      outcome_revision: 0,
    }, {
      onConflict: "organization_id,portfolio_id,symbol",
      ignoreDuplicates: true,
    });
  if (error) throw error;
}

async function readStrategyEvidenceRevision({
  organizationId,
  portfolioId,
  symbol,
}) {
  const { data, error } = await supabaseAdmin
    .from("market_strategy_evidence_revisions")
    .select("backtest_revision,outcome_revision,updated_at")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .eq("symbol", text(symbol).toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return {
    backtest_revision: number(data?.backtest_revision, 0),
    outcome_revision: number(data?.outcome_revision, 0),
    updated_at: data?.updated_at || null,
  };
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

function portfolioMarkIdentity({
  snapshot,
  maxAgeSeconds = 120,
  now = new Date(),
}) {
  const fingerprint = text(snapshot?.latest_quote_fingerprint).toLowerCase();
  const quoteAt = snapshot?.latest_quote_at || null;
  const quoteMs = new Date(quoteAt || 0).getTime();
  const nowMs = new Date(now).getTime();
  const ageSeconds = Number.isFinite(quoteMs) && Number.isFinite(nowMs)
    ? (nowMs - quoteMs) / 1000
    : Number.POSITIVE_INFINITY;
  const bid = number(snapshot?.bid_price);
  const ask = number(snapshot?.ask_price);
  const reasons = [];

  if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
    reasons.push("PORTFOLIO_MARK_QUOTE_FINGERPRINT_REQUIRED");
  }
  if (!Number.isFinite(quoteMs) || quoteMs <= 0) {
    reasons.push("PORTFOLIO_MARK_QUOTE_TIMESTAMP_REQUIRED");
  }
  if (Number.isFinite(ageSeconds) && ageSeconds < -5) {
    reasons.push("PORTFOLIO_MARK_QUOTE_FROM_FUTURE");
  }
  if (!Number.isFinite(ageSeconds) || ageSeconds > maxAgeSeconds) {
    reasons.push("PORTFOLIO_MARK_QUOTE_STALE");
  }
  if (!(bid > 0) || !(ask > 0) || ask < bid) {
    reasons.push("PORTFOLIO_MARK_TOP_OF_BOOK_INVALID");
  }

  return {
    approved: reasons.length === 0,
    reasons,
    snapshot_id: snapshot?.id || null,
    provider: snapshot?.provider || null,
    feed: snapshot?.feed || null,
    quote_at: quoteAt,
    quote_fingerprint: fingerprint || null,
    quote_age_seconds: Number.isFinite(ageSeconds) ? ageSeconds : null,
    bid_price: bid,
    ask_price: ask,
    mark_price: bid > 0 && ask > 0 && ask >= bid ? (bid + ask) / 2 : null,
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
      .select("*")
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
      .select("id,symbol,action,confidence,expires_at,risk_status,invalidation_reason,superseded_by_decision_id,decision_payload")
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
        : terminalDecisionStatus === "EXPIRED"
          ? "GOVERNED_DECISION_EXPIRED"
          : terminalDecisionStatus === "MISSING"
            ? "GOVERNED_DECISION_MISSING"
            : "GOVERNED_DECISION_NOT_APPROVED";
    const terminalOrderStatus = terminalDecisionStatus === "EXPIRED"
      ? "EXPIRED"
      : "CANCELLED";
    const terminalAt = new Date().toISOString();
    const terminalPatch = terminalOrderStatus === "EXPIRED"
      ? {
          status: "EXPIRED",
          expired_at: terminalAt,
          lifecycle_reason: lifecycleReason,
        }
      : {
          status: "CANCELLED",
          cancelled_at: terminalAt,
          cancellation_reason: lifecycleReason,
          lifecycle_reason: lifecycleReason,
        };

    const { data: terminalOrder, error: terminalError } = await supabaseAdmin
      .from("market_paper_orders")
      .update(terminalPatch)
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .eq("id", order.id)
      .in("status", ["QUEUED", "PARTIALLY_FILLED"])
      .select("*")
      .maybeSingle();
    if (terminalError) throw terminalError;

    return {
      filled: false,
      reason: lifecycleReason,
      order: terminalOrder || { ...order, ...terminalPatch },
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
    const cancellationReason = "ORDER_DECISION_MUTATION_MISMATCH";
    const cancelledAt = new Date().toISOString();

    const { data: cancelledOrder, error: cancelOrderError } = await supabaseAdmin
      .from("market_paper_orders")
      .update({
        status: "CANCELLED",
        cancelled_at: cancelledAt,
        cancellation_reason: cancellationReason,
        lifecycle_reason: cancellationReason,
      })
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .eq("id", order.id)
      .in("status", ["QUEUED", "PARTIALLY_FILLED"])
      .select("*")
      .maybeSingle();
    if (cancelOrderError) throw cancelOrderError;

    const { error: cancelDecisionError } = await supabaseAdmin
      .from("market_decisions")
      .update({
        risk_status: "CANCELLED",
        invalidation_reason: cancellationReason,
      })
      .eq("organization_id", organizationId)
      .eq("id", decision.id)
      .eq("risk_status", "APPROVED_PAPER");
    if (cancelDecisionError) throw cancelDecisionError;

    return {
      filled: false,
      reason: cancellationReason,
      order: cancelledOrder || { ...order, status: "CANCELLED" },
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

  let executionState = await loadExecutionRiskState({
    organizationId,
    portfolioId,
  });
  if (!executionState.account) {
    return {
      filled: false,
      reason: "PAPER_ACCOUNT_REQUIRED",
      order,
    };
  }

  const executionDate = new Date().toISOString().slice(0, 10);
  if (text(executionState.account.daily_equity_date) !== executionDate) {
    const { error: rolloverError } = await supabaseAdmin.rpc(
      "market_roll_paper_daily_equity_if_needed",
      {
        p_organization_id: organizationId,
        p_portfolio_id: portfolioId,
      },
    );
    if (rolloverError) throw rolloverError;
    executionState = await loadExecutionRiskState({
      organizationId,
      portfolioId,
    });
    if (!executionState.account) {
      return {
        filled: false,
        reason: "PAPER_ACCOUNT_REQUIRED",
        order,
      };
    }
  }

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

  const side = text(order.side).toUpperCase();

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
  const currentSellPosition = side === "SELL"
    ? executionState.positions.find(
        (position) => text(position.symbol).toUpperCase() === text(order.symbol).toUpperCase(),
      ) || null
    : null;
  const currentSellPositionQuantity = side === "SELL"
    ? Math.max(0, number(currentSellPosition?.quantity, 0))
    : null;

  if (side === "SELL" && !(currentSellPositionQuantity > 0)) {
    const cancellationReason = "PAPER_SELL_POSITION_NO_LONGER_OPEN";
    const cancelledAt = new Date().toISOString();

    const { data: cancelledOrder, error: cancelOrderError } = await supabaseAdmin
      .from("market_paper_orders")
      .update({
        status: "CANCELLED",
        cancelled_at: cancelledAt,
        cancellation_reason: cancellationReason,
        lifecycle_reason: cancellationReason,
      })
      .eq("id", order.id)
      .eq("organization_id", organizationId)
      .in("status", ["QUEUED", "PARTIALLY_FILLED"])
      .select("*")
      .maybeSingle();
    if (cancelOrderError) throw cancelOrderError;

    if (decision?.id) {
      const { error: cancelDecisionError } = await supabaseAdmin
        .from("market_decisions")
        .update({
          risk_status: "CANCELLED",
          invalidation_reason: cancellationReason,
        })
        .eq("id", decision.id)
        .eq("organization_id", organizationId)
        .eq("risk_status", "APPROVED_PAPER");
      if (cancelDecisionError) throw cancelDecisionError;
    }

    return {
      filled: false,
      reason: cancellationReason,
      order: cancelledOrder || order,
      snapshot_id: snapshot?.id || null,
    };
  }

  const executableRemainingQuantity = side === "SELL"
    ? Math.min(remainingQuantity, currentSellPositionQuantity)
    : remainingQuantity;

  const liquidity = calculatePaperExecutableQuantity({
    side: order.side,
    remainingQuantity: executableRemainingQuantity,
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

  let protectiveExitRevalidation = null;
  const protectiveDecision = (
    side === "SELL" &&
    text(decision?.decision_payload?.decision_source).toUpperCase() ===
      "DETERMINISTIC_PROTECTIVE_EXIT"
  );

  const circuitBreakerDecision = (
    side === "SELL" &&
    text(decision?.decision_payload?.decision_source).toUpperCase() ===
      "DETERMINISTIC_PORTFOLIO_CIRCUIT_BREAKER"
  );

  if (
    circuitBreakerDecision &&
    executionState.automation?.circuit_breaker_latched !== true
  ) {
    const cancellationReason = "CIRCUIT_BREAKER_LATCH_CLEARED";
    const cancelledAt = new Date().toISOString();

    const { data: cancelledOrder, error: cancelOrderError } = await supabaseAdmin
      .from("market_paper_orders")
      .update({
        status: "CANCELLED",
        cancelled_at: cancelledAt,
        cancellation_reason: cancellationReason,
        lifecycle_reason: cancellationReason,
      })
      .eq("id", order.id)
      .eq("organization_id", organizationId)
      .in("status", ["QUEUED", "PARTIALLY_FILLED"])
      .select("*")
      .maybeSingle();
    if (cancelOrderError) throw cancelOrderError;

    const { error: cancelDecisionError } = await supabaseAdmin
      .from("market_decisions")
      .update({
        risk_status: "CANCELLED",
        invalidation_reason: cancellationReason,
      })
      .eq("id", decision.id)
      .eq("organization_id", organizationId)
      .eq("risk_status", "APPROVED_PAPER");
    if (cancelDecisionError) throw cancelDecisionError;

    return {
      filled: false,
      reason: cancellationReason,
      order: cancelledOrder || order,
      snapshot_id: snapshot?.id || null,
    };
  }

  if (protectiveDecision) {
    const protectedPositionId = text(decision?.decision_payload?.position_id);
    const protectedPosition = executionState.positions.find(
      (position) => text(position.id) === protectedPositionId,
    ) || null;
    const originalTriggerReason = text(
      decision?.decision_payload?.trigger_reason,
    ).toUpperCase();

    const currentTrigger = evaluateProtectiveExit({
      position: protectedPosition,
      snapshot: {
        bid_price: snapshot?.bid_price,
      },
      enabled: executionState.policy?.protective_exits_enabled !== false,
      trailingStopEnabled: executionState.policy?.trailing_stop_enabled !== false,
      trailingStopPct: number(
        executionState.policy?.default_trailing_stop_pct,
        7.5,
      ),
      timeExitEnabled: executionState.policy?.time_exit_enabled !== false,
      maxHoldingDays: number(
        executionState.policy?.max_holding_days,
        30,
      ),
    });

    protectiveExitRevalidation = {
      ...currentTrigger,
      position_id: protectedPosition?.id || protectedPositionId || null,
      original_trigger_reason: originalTriggerReason || null,
      evaluated_at: new Date().toISOString(),
      price_source: "CURRENT_LIVE_BID",
    };

    if (
      !protectedPosition ||
      !currentTrigger.triggered ||
      text(currentTrigger.reason).toUpperCase() !== originalTriggerReason
    ) {
      const cancellationReason = !protectedPosition
        ? "PROTECTIVE_POSITION_NO_LONGER_OPEN"
        : !currentTrigger.triggered
          ? "PROTECTIVE_EXIT_TRIGGER_NO_LONGER_ACTIVE"
          : "PROTECTIVE_EXIT_TRIGGER_CHANGED";
      const cancelledAt = new Date().toISOString();

      const { data: cancelledOrder, error: cancelOrderError } = await supabaseAdmin
        .from("market_paper_orders")
        .update({
          status: "CANCELLED",
          cancelled_at: cancelledAt,
          cancellation_reason: cancellationReason,
          lifecycle_reason: cancellationReason,
        })
        .eq("id", order.id)
        .eq("organization_id", organizationId)
        .in("status", ["QUEUED", "PARTIALLY_FILLED"])
        .select("*")
        .maybeSingle();
      if (cancelOrderError) throw cancelOrderError;

      const { error: cancelDecisionError } = await supabaseAdmin
        .from("market_decisions")
        .update({
          risk_status: "CANCELLED",
          invalidation_reason: cancellationReason,
        })
        .eq("id", decision.id)
        .eq("organization_id", organizationId)
        .eq("risk_status", "APPROVED_PAPER");
      if (cancelDecisionError) throw cancelDecisionError;

      return {
        filled: false,
        reason: cancellationReason,
        order: cancelledOrder || order,
        protective_exit_revalidation: currentTrigger,
        snapshot_id: snapshot?.id || null,
      };
    }
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

  let strategyReadiness = {
    ready: true,
    status: "DE_RISKING_ALLOWED",
    reasons: [],
    metrics: { authority_effect: "NONE" },
  };
  let strategyHealth = {
    ready: true,
    status: "DE_RISKING_ALLOWED",
    reasons: [],
    metrics: { authority_effect: "NONE" },
  };
  let executionBacktest = null;
  let strategyEvidenceRevision = null;

  if (side === "BUY") {
    await ensureStrategyEvidenceRevision({
      organizationId,
      portfolioId,
      symbol: order.symbol,
    });

    const strategyRevisionBefore = await readStrategyEvidenceRevision({
      organizationId,
      portfolioId,
      symbol: order.symbol,
    });

    executionBacktest = await latestExecutionBacktest({
      organizationId,
      portfolioId,
      symbol: order.symbol,
    });

    const outcomeLimit = Math.max(
      number(executionState.automation?.strategy_health_min_samples, 20),
      50,
    );
    const recentOutcomes = await recentExecutionPredictionOutcomes({
      organizationId,
      portfolioId,
      symbol: order.symbol,
      limit: outcomeLimit,
    });

    const strategyRevisionAfter = await readStrategyEvidenceRevision({
      organizationId,
      portfolioId,
      symbol: order.symbol,
    });

    if (
      strategyRevisionBefore.backtest_revision !== strategyRevisionAfter.backtest_revision ||
      strategyRevisionBefore.outcome_revision !== strategyRevisionAfter.outcome_revision
    ) {
      return {
        filled: false,
        reason: "EXECUTION_STRATEGY_EVIDENCE_CHANGED",
        strategy_revision_before: strategyRevisionBefore,
        strategy_revision_after: strategyRevisionAfter,
        order,
        snapshot_id: snapshot?.id || null,
      };
    }

    strategyEvidenceRevision = strategyRevisionAfter;

    strategyReadiness = evaluateStrategyReadiness({
      action: side,
      automationPolicy: executionState.automation || {},
      backtest: executionBacktest,
      now: new Date(),
    });
    strategyHealth = evaluateStrategyDrift({
      action: side,
      automationPolicy: executionState.automation || {},
      outcomes: recentOutcomes,
    });

    if (!strategyReadiness.ready || !strategyHealth.ready) {
      return {
        filled: false,
        reason: "EXECUTION_STRATEGY_REVALIDATION_FAILED",
        reasons: [
          ...(strategyReadiness.reasons || []),
          ...(strategyHealth.reasons || []),
        ],
        strategy_readiness: strategyReadiness,
        strategy_health: strategyHealth,
        strategy_evidence_revision: strategyEvidenceRevision,
        backtest_run_id: executionBacktest?.id || null,
        order,
        snapshot_id: snapshot?.id || null,
      };
    }
  }

  const account = executionState.account;
  if (!account) {
    return {
      filled: false,
      reason: "PAPER_ACCOUNT_REQUIRED",
      order,
    };
  }

  const portfolioMarkBySymbol = new Map();
  const portfolioMarkEvidence = [];

  if (side === "BUY") {
    for (const position of executionState.positions) {
      const ticker = text(position.symbol).toUpperCase();
      if (!ticker || !(number(position.quantity, 0) > 0)) continue;

      const markSnapshot = ticker === text(order.symbol).toUpperCase()
        ? snapshot
        : await latestSnapshot({
            organizationId,
            portfolioId,
            symbol: ticker,
          });

      if (!markSnapshot) {
        return {
          filled: false,
          reason: "PORTFOLIO_MARK_SNAPSHOT_REQUIRED",
          symbol: ticker,
          order,
        };
      }

      const markFeedAuthority = ticker === text(order.symbol).toUpperCase()
        ? feedAuthority
        : await executionFeedAuthority({
            organizationId,
            portfolioId,
            symbol: ticker,
            snapshot: markSnapshot,
            maxAgeSeconds: maxMarketDataAgeSeconds,
          });
      const markIdentity = portfolioMarkIdentity({
        snapshot: markSnapshot,
        maxAgeSeconds: maxMarketDataAgeSeconds,
      });

      if (!markFeedAuthority.approved || !markIdentity.approved) {
        return {
          filled: false,
          reason: "PORTFOLIO_MARK_AUTHORITY_FAILED",
          symbol: ticker,
          reasons: [
            ...(markFeedAuthority.reasons || []),
            ...(markIdentity.reasons || []),
          ],
          feed_authority: markFeedAuthority,
          mark_identity: markIdentity,
          order,
        };
      }

      portfolioMarkBySymbol.set(ticker, markIdentity.mark_price);
      portfolioMarkEvidence.push({
        symbol: ticker,
        ...markIdentity,
        feed_authority: markFeedAuthority,
      });
    }
  }

  const markedPositions = executionState.positions.map((position) => {
    const ticker = text(position.symbol).toUpperCase();
    const quantityHeld = number(position.quantity, 0);
    const mark = side === "BUY" && portfolioMarkBySymbol.has(ticker)
      ? portfolioMarkBySymbol.get(ticker)
      : ticker === text(order.symbol).toUpperCase()
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
  const [recentFills, recentSellFills] = side === "BUY"
    ? await Promise.all([
        rollingExecutionPaperFills({ organizationId, portfolioId }),
        recentExecutionSellFills({ organizationId, portfolioId }),
      ])
    : [[], []];
  const tradingBudget = summarizeRollingTradingBudget({
    fills: recentFills,
    equity,
    proposedSide: side,
    proposedNotional: fillNotional,
    policy: executionState.policy,
  });
  const cashReserve = evaluateCashReserve({
    action: side,
    cashBalance: account.cash_balance,
    equity,
    proposedNotional: fillNotional,
    policy: executionState.policy,
  });
  const openPositionLimit = evaluateOpenPositionLimit({
    action: side,
    positions: markedPositions,
    proposedSymbol: order.symbol,
    policy: executionState.policy,
  });
  const lossStreakCooloff = evaluateLossStreakCooloff({
    action: side,
    fills: recentSellFills,
    policy: executionState.policy,
  });
  const symbolLossReentry = evaluateSymbolLossReentryLockout({
    action: side,
    proposedSymbol: order.symbol,
    fills: recentSellFills,
    policy: executionState.policy,
  });

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
    ...(strategyReadiness.reasons || []),
    ...(strategyHealth.reasons || []),
    ...(tradingBudget.reasons || []),
    ...(cashReserve.reasons || []),
    ...(openPositionLimit.reasons || []),
    ...(lossStreakCooloff.reasons || []),
    ...(symbolLossReentry.reasons || []),
    ...(executionRisk.reasons || []),
    ...(portfolioRisk.reasons || []),
    ...(microstructureRisk.reasons || []),
    ...(corporateActionRisk.reasons || []),
  ];
  const riskRevalidation = {
    approved:
      feedAuthority.approved &&
      marketDataIdentity.approved &&
      strategyReadiness.ready &&
      strategyHealth.ready &&
      tradingBudget.approved &&
      cashReserve.approved &&
      openPositionLimit.approved &&
      lossStreakCooloff.approved &&
      symbolLossReentry.approved &&
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
    protective_exit_revalidation: protectiveExitRevalidation,
    sell_position_binding: side === "SELL"
      ? {
          position_id: currentSellPosition?.id || null,
          current_position_quantity: currentSellPositionQuantity,
          order_remaining_quantity: remainingQuantity,
          executable_remaining_quantity: executableRemainingQuantity,
          slice_quantity: liquidity.executable_quantity,
        }
      : null,
    portfolio_marks: {
      method: side === "BUY" ? "TOP_OF_BOOK_MIDPOINT" : "DE_RISKING_STORED_MARKS_ALLOWED",
      required_for_buy: true,
      mark_count: portfolioMarkEvidence.length,
      marks: portfolioMarkEvidence,
    },
    strategy_readiness: {
      ...strategyReadiness,
      backtest_run_id: executionBacktest?.id || null,
      backtest_completed_at: executionBacktest?.completed_at || null,
      backtest_started_at: executionBacktest?.started_at || null,
    },
    strategy_health: strategyHealth,
    trading_budget: tradingBudget,
    cash_reserve: cashReserve,
    open_position_limit: openPositionLimit,
    loss_streak_cooloff: lossStreakCooloff,
    symbol_loss_reentry: symbolLossReentry,
    strategy_evidence_revision: strategyEvidenceRevision
      ? {
          symbol: text(order.symbol).toUpperCase(),
          backtest_revision: strategyEvidenceRevision.backtest_revision,
          outcome_revision: strategyEvidenceRevision.outcome_revision,
          updated_at: strategyEvidenceRevision.updated_at,
        }
      : null,
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

  let terminalOrder = data;
  let sellRemainderCancelled = false;
  if (
    side === "SELL" &&
    currentSellPositionQuantity !== null &&
    liquidity.executable_quantity >= currentSellPositionQuantity - 1e-12 &&
    number(data?.remaining_quantity, 0) > 0
  ) {
    const cancellationReason = "PAPER_SELL_POSITION_EXHAUSTED";
    const cancelledAt = new Date().toISOString();
    const { data: cancelledOrder, error: cancelOrderError } = await supabaseAdmin
      .from("market_paper_orders")
      .update({
        status: "CANCELLED",
        cancelled_at: cancelledAt,
        cancellation_reason: cancellationReason,
        lifecycle_reason: cancellationReason,
      })
      .eq("id", order.id)
      .eq("organization_id", organizationId)
      .in("status", ["QUEUED", "PARTIALLY_FILLED"])
      .select("*")
      .maybeSingle();
    if (cancelOrderError) throw cancelOrderError;

    if (decision?.id) {
      const { error: cancelDecisionError } = await supabaseAdmin
        .from("market_decisions")
        .update({
          risk_status: "CANCELLED",
          invalidation_reason: cancellationReason,
        })
        .eq("id", decision.id)
        .eq("organization_id", organizationId)
        .eq("risk_status", "APPROVED_PAPER");
      if (cancelDecisionError) throw cancelDecisionError;
    }

    terminalOrder = cancelledOrder || data;
    sellRemainderCancelled = true;
  }

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
    partial: data?.order_status === "PARTIALLY_FILLED" && !sellRemainderCancelled,
    terminal: data?.order_status === "FILLED" || sellRemainderCancelled,
    remainder_cancelled: sellRemainderCancelled,
    result: terminalOrder,
    liquidity,
    execution_quality: executionQuality,
    equity_snapshot: equitySnapshot,
    snapshot_id: snapshot.id,
    market_price: marketPrice,
    fill_price: fillPrice,
    fill_quantity: liquidity.executable_quantity,
    remaining_quantity: sellRemainderCancelled
      ? 0
      : data?.remaining_quantity ?? null,
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
