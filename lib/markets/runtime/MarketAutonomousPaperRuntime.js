import {
  applyPortfolioRiskBudgetToSizing,
  calculateAutonomousPaperOrder,
  researchRefreshRequired,
} from "@/lib/markets/runtime/MarketAutonomousPaperModels";
import { evaluateCashReserve } from "@/lib/markets/runtime/MarketCashReserveModels";
import { evaluatePortfolioCircuitBreaker } from "@/lib/markets/runtime/MarketCircuitBreakerModels";
import {
  calculatePortfolioRiskBudgetScale,
  historicalRiskMetrics,
  returnsFromBars,
} from "@/lib/markets/runtime/MarketPortfolioRiskModels";
import { MarketCorporateActionAdjustmentRuntime } from "@/lib/markets/runtime/MarketCorporateActionAdjustmentRuntime";
import { buildRiskControlEvidenceRefs } from "@/lib/markets/runtime/MarketDecisionEvidenceModels";
import { MarketCorporateActionRiskRuntime } from "@/lib/markets/runtime/MarketCorporateActionRiskRuntime";
import { MarketIntelligenceIngestionRuntime } from "@/lib/markets/runtime/MarketIntelligenceIngestionRuntime";
import { MarketOwnedNewsAnalysisRuntime } from "@/lib/markets/runtime/MarketOwnedNewsAnalysisRuntime";
import {
  evaluateLossStreakCooloff,
  evaluateOpenPositionLimit,
  evaluateSymbolLossReentryLockout,
} from "@/lib/markets/runtime/MarketExposureDisciplineModels";
import { evaluateMarketMicrostructureRisk } from "@/lib/markets/runtime/MarketMicrostructureRiskModels";
import { MarketPaperExecutionRuntime } from "@/lib/markets/runtime/MarketPaperExecutionRuntime";
import { MarketPortfolioPerformanceRuntime } from "@/lib/markets/runtime/MarketPortfolioPerformanceRuntime";
import { MarketPortfolioRiskRuntime } from "@/lib/markets/runtime/MarketPortfolioRiskRuntime";
import { MarketPredictionOutcomeRuntime } from "@/lib/markets/runtime/MarketPredictionOutcomeRuntime";
import { evaluateProtectiveExit } from "@/lib/markets/runtime/MarketProtectiveExitModels";
import { MarketSessionSafetyRuntime } from "@/lib/markets/runtime/MarketSessionSafetyRuntime";
import { evaluatePaperTradeRisk } from "@/lib/markets/runtime/MarketRiskPolicyRuntime";
import { MarketSpecialistAgentRuntime } from "@/lib/markets/runtime/MarketSpecialistAgentRuntime";
import { evaluateStrategyDrift } from "@/lib/markets/runtime/MarketStrategyDriftModels";
import { evaluateStrategyReadiness } from "@/lib/markets/runtime/MarketStrategyReadinessModels";
import { summarizeRollingTradingBudget } from "@/lib/markets/runtime/MarketTradingBudgetModels";
import { MarketWalkForwardRuntime } from "@/lib/markets/runtime/MarketWalkForwardRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function latestPrice(snapshot, side = "BUY") {
  const candidates = side === "SELL"
    ? [snapshot?.bid_price, snapshot?.latest_trade_price, snapshot?.minute_close, snapshot?.day_close]
    : [snapshot?.ask_price, snapshot?.latest_trade_price, snapshot?.minute_close, snapshot?.day_close];
  return candidates.map((value) => number(value, null)).find((value) => value && value > 0) || null;
}

function stale(snapshot, maxAgeSeconds = 120) {
  const captured = new Date(snapshot?.captured_at || 0).getTime();
  if (!Number.isFinite(captured) || captured <= 0) return true;
  return (Date.now() - captured) > (maxAgeSeconds * 1000);
}

async function loadAutomationState({ organizationId, portfolioId }) {
  const [
    policyResult,
    riskResult,
    accountResult,
    positionsResult,
    watchlistResult,
    liveSnapshotsResult,
    restSnapshotsResult,
  ] = await Promise.all([
    supabaseAdmin.from("market_automation_policies").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolioId).maybeSingle(),
    supabaseAdmin.from("market_risk_policies").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolioId).maybeSingle(),
    supabaseAdmin.from("market_paper_accounts").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolioId).maybeSingle(),
    supabaseAdmin.from("market_paper_positions").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolioId),
    supabaseAdmin.from("market_watchlist").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolioId).eq("status", "ACTIVE"),
    supabaseAdmin.from("market_live_snapshots").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolioId).order("captured_at", { ascending: false }),
    supabaseAdmin.from("market_snapshots").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolioId).order("captured_at", { ascending: false }).limit(200),
  ]);

  for (const result of [policyResult, riskResult, accountResult, positionsResult, watchlistResult, liveSnapshotsResult, restSnapshotsResult]) {
    if (result.error) throw result.error;
  }

  const liveBySymbol = new Map();
  for (const row of liveSnapshotsResult.data || []) {
    const symbol = clean(row.symbol).toUpperCase();
    if (!liveBySymbol.has(symbol)) liveBySymbol.set(symbol, row);
  }

  const snapshots = [...(liveSnapshotsResult.data || []), ...(restSnapshotsResult.data || [])];
  const latestBySymbol = new Map();
  for (const row of snapshots) {
    const symbol = clean(row.symbol).toUpperCase();
    if (!latestBySymbol.has(symbol)) latestBySymbol.set(symbol, row);
  }

  const lastResearchBySymbol = new Map();
  for (const row of restSnapshotsResult.data || []) {
    const symbol = clean(row.symbol).toUpperCase();
    if (!lastResearchBySymbol.has(symbol)) {
      lastResearchBySymbol.set(symbol, row.captured_at || row.created_at || null);
    }
  }

  return {
    automationPolicy: policyResult.data || null,
    riskPolicy: riskResult.data || {},
    account: accountResult.data || null,
    positions: positionsResult.data || [],
    watchlist: watchlistResult.data || [],
    liveBySymbol,
    latestBySymbol,
    lastResearchBySymbol,
  };
}

async function latestDecisionWithinCooldown({
  organizationId,
  portfolioId,
  symbol,
  cooldownMinutes,
}) {
  const cutoff = new Date(Date.now() - (Math.max(0, cooldownMinutes) * 60 * 1000)).toISOString();
  const { data, error } = await supabaseAdmin
    .from("market_decisions")
    .select("id,created_at,action,confidence")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .eq("symbol", symbol)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadSymbolEvidence({
  organizationId,
  portfolioId,
  symbol,
}) {
  const [barsResult, evidenceResult, filingsResult, fundamentalsResult] = await Promise.all([
    supabaseAdmin
      .from("market_bars")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .eq("symbol", symbol)
      .eq("timeframe", "1Day")
      .order("bar_time", { ascending: true })
      .limit(220),
    supabaseAdmin
      .from("market_evidence_events")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .eq("symbol", symbol)
      .order("observed_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("market_filings")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .eq("symbol", symbol)
      .order("filed_at", { ascending: false })
      .limit(60),
    supabaseAdmin
      .from("market_fundamental_snapshots")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .eq("symbol", symbol)
      .order("period_end", { ascending: false })
      .limit(8),
  ]);

  for (const result of [barsResult, evidenceResult, filingsResult, fundamentalsResult]) {
    if (result.error) throw result.error;
  }

  return {
    bars: barsResult.data || [],
    evidence: evidenceResult.data || [],
    filings: filingsResult.data || [],
    fundamentals: fundamentalsResult.data || [],
  };
}

async function latestBacktestRun({
  organizationId,
  portfolioId,
  symbol,
}) {
  const { data, error } = await supabaseAdmin
    .from("market_backtest_runs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .eq("symbol", symbol)
    .eq("strategy_key", "TECHNICAL_QUANT_V1")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function backtestRefreshRequired(backtest, automationPolicy, now = new Date()) {
  if (!backtest) return true;
  const timestamp = new Date(backtest.completed_at || backtest.started_at || 0).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) return true;
  const age = new Date(now).getTime() - timestamp;
  const maxAgeHours = Math.max(1, number(automationPolicy?.validation_max_age_hours, 168));
  return age >= (maxAgeHours * 60 * 60 * 1000);
}

async function recentPredictionOutcomes({
  organizationId,
  portfolioId,
  symbol,
  limit = 50,
}) {
  const { data, error } = await supabaseAdmin
    .from("market_prediction_outcomes")
    .select("directional_hit,squared_error,log_loss,excess_return,evaluation_time")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .eq("symbol", symbol)
    .order("evaluation_time", { ascending: false })
    .limit(Math.max(5, Math.min(500, number(limit, 50))));
  if (error) throw error;
  return data || [];
}

async function rolling24hPaperFills({
  organizationId,
  portfolioId,
  now = new Date(),
}) {
  const end = new Date(now);
  const start = new Date(end.getTime() - (24 * 60 * 60 * 1000));
  const { data, error } = await supabaseAdmin
    .from("market_paper_fills")
    .select("id,order_id,side,notional,fee_amount,filled_at,metadata")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .gte("filled_at", start.toISOString())
    .lte("filled_at", end.toISOString())
    .order("filled_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data || [];
}

async function recentRealizedSellFills({
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

function markPortfolio({ account, positions, snapshots }) {
  const marked = positions.map((position) => {
    const symbol = clean(position.symbol).toUpperCase();
    const snapshot = snapshots.get(symbol);
    const price = latestPrice(snapshot, "BUY") || number(position.market_price, 0);
    const quantity = number(position.quantity, 0);
    return {
      ...position,
      market_price: price,
      market_value: quantity * price,
    };
  });

  const positionValue = marked.reduce((sum, row) => sum + number(row.market_value, 0), 0);
  const equity = number(account?.cash_balance, 0) + positionValue;
  const dailyStart = number(account?.daily_equity_start, equity);
  const highWater = Math.max(number(account?.high_water_equity, equity), equity);
  const dailyPnl = equity - dailyStart;
  const drawdownPct = highWater > 0
    ? Math.max(0, ((highWater - equity) / highWater) * 100)
    : 0;

  return {
    equity,
    dailyPnl,
    drawdownPct,
    positions: marked,
  };
}

function markPortfolioForCircuitBreaker({
  account,
  positions,
  liveSnapshots,
  maxAgeSeconds = 120,
  now = new Date(),
}) {
  const nowMs = new Date(now).getTime();
  const marked = [];
  const reasons = [];

  for (const position of positions) {
    const symbol = clean(position.symbol).toUpperCase();
    const quantity = number(position.quantity, 0);
    if (!symbol || !(quantity > 0)) continue;

    const snapshot = liveSnapshots.get(symbol);
    const quoteMs = new Date(snapshot?.latest_quote_at || 0).getTime();
    const bid = number(snapshot?.bid_price, null);
    const ask = number(snapshot?.ask_price, null);
    const transport = clean(snapshot?.provenance?.transport).toLowerCase();
    const ageSeconds = Number.isFinite(nowMs) && Number.isFinite(quoteMs)
      ? (nowMs - quoteMs) / 1000
      : Number.POSITIVE_INFINITY;

    if (!snapshot?.id) reasons.push(`CIRCUIT_BREAKER_MARK_SNAPSHOT_REQUIRED:${symbol}`);
    if (transport !== "websocket") reasons.push(`CIRCUIT_BREAKER_MARK_WEBSOCKET_REQUIRED:${symbol}`);
    if (!Number.isFinite(ageSeconds) || ageSeconds < -5 || ageSeconds > maxAgeSeconds) {
      reasons.push(`CIRCUIT_BREAKER_MARK_STALE:${symbol}`);
    }
    if (!(bid > 0) || !(ask > 0) || ask < bid) {
      reasons.push(`CIRCUIT_BREAKER_MARK_TOP_OF_BOOK_INVALID:${symbol}`);
    }

    if (reasons.some((reason) => reason.endsWith(`:${symbol}`))) continue;

    const price = (bid + ask) / 2;
    marked.push({
      ...position,
      symbol,
      market_price: price,
      market_value: quantity * price,
    });
  }

  if (reasons.length) {
    return {
      approved: false,
      high_water_authoritative: false,
      reasons,
      equity: null,
      dailyPnl: null,
      drawdownPct: null,
      positions: [],
    };
  }

  const positionValue = marked.reduce((sum, row) => sum + number(row.market_value, 0), 0);
  const equity = number(account?.cash_balance, 0) + positionValue;
  const dailyStart = number(account?.daily_equity_start, equity);
  const highWater = Math.max(number(account?.high_water_equity, equity), equity);
  const dailyPnl = equity - dailyStart;
  const drawdownPct = highWater > 0
    ? Math.max(0, ((highWater - equity) / highWater) * 100)
    : 0;

  return {
    approved: true,
    high_water_authoritative: true,
    reasons: [],
    equity,
    dailyPnl,
    drawdownPct,
    positions: marked,
  };
}

async function hasQueuedOrder({ organizationId, portfolioId, symbol }) {
  const { data, error } = await supabaseAdmin
    .from("market_paper_orders")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .eq("symbol", symbol)
    .in("status", ["QUEUED", "PARTIALLY_FILLED"])
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function createAutomationRun({ organizationId, portfolioId }) {
  const { data, error } = await supabaseAdmin
    .from("market_automation_runs")
    .insert({
      organization_id: organizationId,
      portfolio_id: portfolioId,
      status: "RUNNING",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function finishAutomationRun(runId, patch) {
  const { data, error } = await supabaseAdmin
    .from("market_automation_runs")
    .update({
      ...patch,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function latchPortfolioCircuitBreaker({
  organizationId,
  portfolioId,
  automationPolicy,
  breaker,
}) {
  const now = new Date().toISOString();
  const reason = breaker.reasons.join(";") || "PORTFOLIO_CIRCUIT_BREAKER";

  if (automationPolicy?.circuit_breaker_latched !== true) {
    const { error: policyError } = await supabaseAdmin
      .from("market_automation_policies")
      .update({
        circuit_breaker_latched: true,
        circuit_breaker_reason: reason,
        circuit_breaker_triggered_at: now,
        updated_at: now,
      })
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId);
    if (policyError) throw policyError;

    const { error: eventError } = await supabaseAdmin
      .from("market_risk_events")
      .insert({
        organization_id: organizationId,
        portfolio_id: portfolioId,
        event_type: "PORTFOLIO_CIRCUIT_BREAKER",
        severity: "CRITICAL",
        status: "OPEN",
        reason_codes: breaker.reasons,
        metrics: breaker.metrics,
        action_taken: {
          block_new_entries: true,
          cancel_active_buys: true,
          liquidate_long_paper_positions: true,
        },
        authority_effect: "PAPER_ONLY",
      });
    if (eventError && String(eventError.code || "") !== "23505") throw eventError;
  }

  const { error: cancelError } = await supabaseAdmin
    .from("market_paper_orders")
    .update({
      status: "CANCELLED",
      lifecycle_reason: "PORTFOLIO_CIRCUIT_BREAKER",
    })
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .eq("side", "BUY")
    .in("status", ["QUEUED", "PARTIALLY_FILLED"]);
  if (cancelError) throw cancelError;

  return {
    ...breaker,
    latched: true,
    reason,
  };
}

async function createCircuitBreakerDecision({
  organizationId,
  portfolioId,
  position,
  breaker,
  snapshot,
}) {
  const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString();
  const evidenceRefs = buildRiskControlEvidenceRefs({ position, snapshot });
  const { data, error } = await supabaseAdmin
    .from("market_decisions")
    .insert({
      organization_id: organizationId,
      portfolio_id: portfolioId,
      symbol: clean(position.symbol).toUpperCase(),
      horizon: "RISK_CONTROL",
      action: "SELL",
      confidence: 1,
      reference_price: latestPrice(snapshot, "SELL"),
      reference_time: snapshot?.captured_at || new Date().toISOString(),
      expected_return: null,
      downside_risk: null,
      evidence_ids: [],
      evidence_refs: evidenceRefs,
      thesis_ids: [],
      risk_status: "APPROVED_PAPER",
      risk_reasons: breaker.reasons,
      decision_payload: {
        decision_source: "DETERMINISTIC_PORTFOLIO_CIRCUIT_BREAKER",
        confidence_semantics: "deterministic_risk_control_not_prediction",
        breaker_reasons: breaker.reasons,
        breaker_metrics: breaker.metrics,
        position_id: position.id,
        position_quantity: number(position.quantity, 0),
        authority_effect: "PAPER_ONLY",
      },
      expires_at: expiresAt,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function createProtectiveExitDecision({
  organizationId,
  portfolioId,
  position,
  trigger,
  snapshot,
}) {
  const expiresAt = new Date(Date.now() + (30 * 60 * 1000)).toISOString();
  const evidenceRefs = buildRiskControlEvidenceRefs({ position, snapshot });
  const { data, error } = await supabaseAdmin
    .from("market_decisions")
    .insert({
      organization_id: organizationId,
      portfolio_id: portfolioId,
      symbol: clean(position.symbol).toUpperCase(),
      horizon: "INTRADAY",
      action: "SELL",
      confidence: 1,
      reference_price: trigger.exit_price,
      reference_time: snapshot?.captured_at || new Date().toISOString(),
      expected_return: null,
      downside_risk: null,
      evidence_ids: [],
      evidence_refs: evidenceRefs,
      thesis_ids: [],
      risk_status: "APPROVED_PAPER",
      risk_reasons: [trigger.reason],
      decision_payload: {
        decision_source: "DETERMINISTIC_PROTECTIVE_EXIT",
        confidence_semantics: "deterministic_trigger_not_prediction",
        trigger_reason: trigger.reason,
        trigger_price: trigger.trigger_price,
        exit_reference_price: trigger.exit_price,
        position_id: position.id,
        position_quantity: trigger.quantity,
        stop_loss_price: position.stop_loss_price,
        take_profit_price: position.take_profit_price,
        trailing_stop_price: trigger.trailing_stop_price ?? null,
        high_water_price: position.high_water_price ?? null,
        opened_at: position.opened_at ?? null,
        holding_days: trigger.holding_days ?? null,
        max_holding_days: trigger.max_holding_days ?? null,
        authority_effect: "PAPER_ONLY",
      },
      expires_at: expiresAt,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function createPaperOrder({
  organizationId,
  portfolioId,
  decision,
  sizing,
  risk,
  timeInForce = "DAY",
  metadata = {},
}) {
  const lifecycle = await MarketSessionSafetyRuntime.resolvePaperOrderExpiry({
    organizationId,
    timeInForce,
    decisionExpiresAt: decision.expires_at || null,
  });

  const { data, error } = await supabaseAdmin
    .from("market_paper_orders")
    .insert({
      organization_id: organizationId,
      portfolio_id: portfolioId,
      decision_id: decision.id,
      symbol: decision.symbol,
      side: sizing.side,
      order_type: "MARKET",
      quantity: sizing.quantity,
      filled_quantity: 0,
      remaining_quantity: sizing.quantity,
      requested_price: sizing.market_price,
      status: "QUEUED",
      time_in_force: lifecycle.time_in_force,
      expires_at: lifecycle.expires_at,
      risk_snapshot: {
        ...risk.snapshot,
        automation: true,
        sizing: {
          target_position_pct: sizing.target_position_pct,
          confidence_scaled_target_position_pct: sizing.confidence_scaled_target_position_pct ?? null,
          candidate_annualized_volatility_pct: sizing.candidate_annualized_volatility_pct ?? null,
          target_annualized_volatility_pct: sizing.target_annualized_volatility_pct ?? null,
          volatility_scale: sizing.volatility_scale ?? null,
          market_regime_sizing_scale: sizing.market_regime_sizing_scale ?? null,
          minimum_confidence: sizing.minimum_confidence,
        },
      },
      metadata: {
        simulation_only: true,
        autonomous_cycle: true,
        ...metadata,
      },
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function runAutonomousPaperCycle({
  organizationId,
  portfolioId,
}) {
  if (!organizationId || !portfolioId) throw new Error("organizationId and portfolioId are required");

  const run = await createAutomationRun({ organizationId, portfolioId });
  const skipped = [];
  const errors = [];
  let decisionsCreated = 0;
  let ordersCreated = 0;
  let ordersFilled = 0;
  let executionSlices = 0;
  let symbolsConsidered = 0;

  try {
    let state = await loadAutomationState({ organizationId, portfolioId });
    const automationPolicy = state.automationPolicy;

    if (
      (!automationPolicy?.auto_paper_enabled || automationPolicy?.kill_switch) &&
      automationPolicy?.circuit_breaker_latched !== true
    ) {
      return finishAutomationRun(run.id, {
        status: "SKIPPED",
        symbols_considered: 0,
        skipped: [{
          reason: automationPolicy?.kill_switch
            ? "AUTOMATION_KILL_SWITCH"
            : "AUTO_PAPER_DISABLED",
        }],
      });
    }

    if (!state.account) {
      throw new Error("PAPER_ACCOUNT_REQUIRED");
    }

    try {
      const preCycleAdjustments = await MarketCorporateActionAdjustmentRuntime.applyDue({
        organizationId,
        portfolioId,
      });
      if (preCycleAdjustments.applied > 0) {
        state = await loadAutomationState({ organizationId, portfolioId });
      }
      for (const unresolved of preCycleAdjustments.results.filter((row) => row.status === "UNRESOLVED")) {
        errors.push({
          symbol: null,
          stage: "CORPORATE_ACTION_ACCOUNTING",
          error: clean(unresolved.reason || "CORPORATE_ACTION_ACCOUNTING_UNRESOLVED").slice(0, 500),
        });
      }
    } catch (adjustmentError) {
      errors.push({
        symbol: null,
        stage: "CORPORATE_ACTION_ACCOUNTING",
        error: clean(adjustmentError?.message || adjustmentError || "CORPORATE_ACTION_ACCOUNTING_FAILED").slice(0, 500),
      });
    }

    const maxTrades = Math.max(1, number(automationPolicy.max_trades_per_cycle, 3));

    try {
      const activeOrderExecution = await MarketPaperExecutionRuntime.processQueued({
        organizationId,
        portfolioId,
        slippageBps: 5,
        feeAmount: 0,
        limit: 50,
      });
      executionSlices += Number(activeOrderExecution.execution_slices || 0);
      ordersFilled += Number(activeOrderExecution.completed_orders || 0);
      if (activeOrderExecution.execution_slices > 0) {
        state = await loadAutomationState({ organizationId, portfolioId });
      }
    } catch (queuedExecutionError) {
      errors.push({
        symbol: null,
        stage: "ACTIVE_ORDER_EXECUTION",
        error: clean(queuedExecutionError?.message || queuedExecutionError || "ACTIVE_ORDER_EXECUTION_FAILED").slice(0, 500),
      });
    }

    const breakerMarked = markPortfolioForCircuitBreaker({
      account: state.account,
      positions: state.positions,
      liveSnapshots: state.liveBySymbol,
      maxAgeSeconds: number(
        state.riskPolicy?.max_market_data_age_seconds,
        120,
      ),
    });
    let breaker = breakerMarked.approved
      ? evaluatePortfolioCircuitBreaker({
          policy: state.riskPolicy,
          account: state.account,
          marked: breakerMarked,
        })
      : {
          breached: false,
          reasons: [],
          metrics: {
            valuation_status: "UNAVAILABLE",
            valuation_reasons: breakerMarked.reasons,
            authority_effect: "NO_NEW_BREACH_INFERRED",
          },
        };

    if (!breakerMarked.approved) {
      errors.push({
        symbol: null,
        stage: "CIRCUIT_BREAKER_MARKING",
        error: breakerMarked.reasons.join(",").slice(0, 500),
      });
    }

    if (automationPolicy?.circuit_breaker_latched === true && !breaker.breached) {
      breaker = {
        ...breaker,
        breached: true,
        reasons: [
          clean(automationPolicy.circuit_breaker_reason)
            || "PORTFOLIO_CIRCUIT_BREAKER_LATCHED",
        ],
      };
    }

    if (breaker.breached) {
      const latched = await latchPortfolioCircuitBreaker({
        organizationId,
        portfolioId,
        automationPolicy,
        breaker,
      });

      state = await loadAutomationState({ organizationId, portfolioId });

      for (const position of state.positions) {
        const quantity = number(position.quantity, 0);
        const symbol = clean(position.symbol).toUpperCase();
        if (!(quantity > 0) || !symbol) continue;
        if (await hasQueuedOrder({ organizationId, portfolioId, symbol })) continue;

        const snapshot = state.latestBySymbol.get(symbol);
        const exitPrice = latestPrice(snapshot, "SELL") || number(position.market_price, 0);
        if (!(exitPrice > 0)) {
          errors.push({
            symbol,
            stage: "CIRCUIT_BREAKER_LIQUIDATION",
            error: "PAPER_EXIT_PRICE_UNAVAILABLE",
          });
          continue;
        }

        const decision = await createCircuitBreakerDecision({
          organizationId,
          portfolioId,
          position,
          breaker: latched,
          snapshot,
        });
        decisionsCreated += 1;

        const order = await createPaperOrder({
          organizationId,
          portfolioId,
          decision,
          sizing: {
            side: "SELL",
            quantity,
            market_price: exitPrice,
            target_position_pct: 0,
            minimum_confidence: 1,
          },
          risk: {
            approved: true,
            status: "APPROVED_PAPER",
            reasons: latched.reasons,
            snapshot: {
              portfolio_circuit_breaker: {
                ...latched.metrics,
                reasons: latched.reasons,
                authority_effect: "PAPER_ONLY",
              },
            },
          },
          timeInForce: "GTC",
          metadata: {
            portfolio_circuit_breaker: true,
          },
        });
        ordersCreated += 1;
      }

      try {
        const liquidationExecution = await MarketPaperExecutionRuntime.processQueued({
          organizationId,
          portfolioId,
          slippageBps: 5,
          feeAmount: 0,
          limit: 100,
        });
        executionSlices += Number(liquidationExecution.execution_slices || 0);
        ordersFilled += Number(liquidationExecution.completed_orders || 0);
      } catch (liquidationError) {
        errors.push({
          symbol: null,
          stage: "CIRCUIT_BREAKER_LIQUIDATION",
          error: clean(liquidationError?.message || liquidationError || "CIRCUIT_BREAKER_LIQUIDATION_FAILED").slice(0, 500),
        });
      }

      state = await loadAutomationState({ organizationId, portfolioId });
      const postBreakerAuthoritative = markPortfolioForCircuitBreaker({
        account: state.account,
        positions: state.positions,
        liveSnapshots: state.liveBySymbol,
        maxAgeSeconds: number(
          state.riskPolicy?.max_market_data_age_seconds,
          120,
        ),
      });
      const postBreakerMarked = postBreakerAuthoritative.approved
        ? postBreakerAuthoritative
        : markPortfolio({
            account: state.account,
            positions: state.positions,
            snapshots: state.latestBySymbol,
          });

      await MarketPortfolioPerformanceRuntime.recordSnapshot({
        organizationId,
        portfolioId,
        sourceType: "CYCLE",
        sourceId: run.id,
        markedPortfolio: postBreakerMarked,
        metadata: {
          portfolio_circuit_breaker: true,
          breaker_reasons: latched.reasons,
          breaker_metrics: latched.metrics,
          execution_slices: executionSlices,
          orders_created: ordersCreated,
          orders_filled: ordersFilled,
        },
      });

      return finishAutomationRun(run.id, {
        status: "COMPLETED",
        symbols_considered: 0,
        decisions_created: decisionsCreated,
        orders_created: ordersCreated,
        orders_filled: ordersFilled,
        outcomes_scored: 0,
        skipped: [{
          reason: "PORTFOLIO_CIRCUIT_BREAKER_LATCHED",
          details: latched.reasons,
        }],
        errors,
        metadata: {
          execution_mode: "PAPER",
          live_execution_enabled: false,
          portfolio_circuit_breaker: true,
          breaker_reasons: latched.reasons,
          breaker_metrics: latched.metrics,
          execution_slices: executionSlices,
        },
      });
    }

    if (state.riskPolicy?.protective_exits_enabled !== false) {
      for (const position of state.positions) {
        if (ordersCreated >= maxTrades) break;

        const symbol = clean(position.symbol).toUpperCase();
        if (!symbol || !(number(position.quantity, 0) > 0)) continue;
        const snapshot = state.latestBySymbol.get(symbol);
        if (!snapshot || stale(snapshot, number(state.riskPolicy?.max_market_data_age_seconds, 120))) {
          continue;
        }

        const executableHighWater = latestPrice(snapshot, "SELL");
        if (
          executableHighWater > 0 &&
          executableHighWater > number(position.high_water_price, 0)
        ) {
          const { error: highWaterError } = await supabaseAdmin
            .from("market_paper_positions")
            .update({
              high_water_price: executableHighWater,
              updated_at: new Date().toISOString(),
            })
            .eq("organization_id", organizationId)
            .eq("portfolio_id", portfolioId)
            .eq("id", position.id);
          if (highWaterError) throw highWaterError;
          position.high_water_price = executableHighWater;
        }

        if (await hasQueuedOrder({ organizationId, portfolioId, symbol })) {
          continue;
        }

        const trigger = evaluateProtectiveExit({
          position,
          snapshot,
          enabled: true,
          trailingStopEnabled: state.riskPolicy?.trailing_stop_enabled !== false,
          trailingStopPct: number(state.riskPolicy?.default_trailing_stop_pct, 7.5),
          timeExitEnabled: state.riskPolicy?.time_exit_enabled !== false,
          maxHoldingDays: number(state.riskPolicy?.max_holding_days, 30),
        });
        if (!trigger.triggered) continue;

        const decision = await createProtectiveExitDecision({
          organizationId,
          portfolioId,
          position,
          trigger,
          snapshot,
        });
        decisionsCreated += 1;

        const risk = {
          approved: true,
          status: "APPROVED_PAPER",
          reasons: [trigger.reason],
          snapshot: {
            protective_exit: {
              reason: trigger.reason,
              trigger_price: trigger.trigger_price,
              exit_reference_price: trigger.exit_price,
              stop_loss_price: position.stop_loss_price,
              take_profit_price: position.take_profit_price,
              trailing_stop_price: trigger.trailing_stop_price ?? null,
              high_water_price: position.high_water_price ?? null,
              opened_at: position.opened_at ?? null,
              holding_days: trigger.holding_days ?? null,
              max_holding_days: trigger.max_holding_days ?? null,
              authority_effect: "PAPER_ONLY",
            },
          },
        };

        const order = await createPaperOrder({
          organizationId,
          portfolioId,
          decision,
          sizing: {
            side: "SELL",
            quantity: trigger.quantity,
            market_price: trigger.exit_price,
            target_position_pct: 0,
            minimum_confidence: 1,
          },
          risk,
        });
        ordersCreated += 1;

        const fill = await MarketPaperExecutionRuntime.processOrder({
          organizationId,
          portfolioId,
          order,
          slippageBps: 5,
          feeAmount: 0,
        });
        if (fill.filled) {
          executionSlices += 1;
          if (fill.result?.order_status === "FILLED") ordersFilled += 1;
        }

        state = await loadAutomationState({ organizationId, portfolioId });
      }
    }

    for (const item of state.watchlist) {
      if (ordersCreated >= maxTrades) break;

      const symbol = clean(item.symbol).toUpperCase();
      if (!symbol) continue;
      symbolsConsidered += 1;

      try {
        const snapshot = state.latestBySymbol.get(symbol);
        if (!snapshot || stale(snapshot, number(state.riskPolicy?.max_market_data_age_seconds, 120))) {
          skipped.push({ symbol, reason: "MARKET_DATA_STALE" });
          continue;
        }

        if (await hasQueuedOrder({ organizationId, portfolioId, symbol })) {
          skipped.push({ symbol, reason: "QUEUED_ORDER_EXISTS" });
          continue;
        }

        const recentDecision = await latestDecisionWithinCooldown({
          organizationId,
          portfolioId,
          symbol,
          cooldownMinutes: number(automationPolicy.cooldown_minutes, 60),
        });
        if (recentDecision) {
          skipped.push({ symbol, reason: "DECISION_COOLDOWN" });
          continue;
        }

        let evidence = null;
        const researchDue = researchRefreshRequired({
          lastResearchAt: state.lastResearchBySymbol.get(symbol),
          maxAgeMinutes: 360,
        });

        if (researchDue) {
          try {
            const researchStart = new Date(Date.now() - (400 * 24 * 60 * 60 * 1000)).toISOString();
            const refreshed = await MarketIntelligenceIngestionRuntime.refreshSymbol({
              organizationId,
              portfolioId,
              symbol,
              exchange: item.exchange || null,
              feed: clean(snapshot.feed || "iex") || "iex",
              barsStart: researchStart,
              barsTimeframe: "1Day",
              barsLimit: 250,
              newsLimit: 20,
            });
            evidence = {
              bars: refreshed.bars || [],
              evidence: refreshed.evidence || [],
              filings: refreshed.filings || [],
              fundamentals: refreshed.fundamentals || [],
            };
          } catch (researchError) {
            errors.push({
              symbol,
              stage: "RESEARCH_REFRESH",
              error: clean(researchError?.message || researchError || "MARKETS_RESEARCH_REFRESH_FAILED").slice(0, 500),
            });
          }
        }

        if (!evidence) {
          evidence = await loadSymbolEvidence({
            organizationId,
            portfolioId,
            symbol,
          });
        }

        try {
          const adjustments = await MarketCorporateActionAdjustmentRuntime.applyDue({
            organizationId,
            portfolioId,
          });
          if (adjustments.applied > 0) {
            state = await loadAutomationState({ organizationId, portfolioId });
          }
          if (adjustments.unresolved > 0) {
            errors.push({
              symbol,
              stage: "CORPORATE_ACTION_ACCOUNTING",
              error: String(
                adjustments.results
                  .filter((row) => row.status === "UNRESOLVED")
                  .map((row) => row.reason)
                  .join("; ")
                  || "CORPORATE_ACTION_ACCOUNTING_UNRESOLVED",
              ).slice(0, 500),
            });
          }
        } catch (adjustmentError) {
          errors.push({
            symbol,
            stage: "CORPORATE_ACTION_ACCOUNTING",
            error: clean(adjustmentError?.message || adjustmentError || "CORPORATE_ACTION_ACCOUNTING_FAILED").slice(0, 500),
          });
        }

        if (evidence.bars.length < 21) {
          skipped.push({ symbol, reason: "INSUFFICIENT_DAILY_BARS" });
          continue;
        }

        let scoredEvidence = evidence.evidence;
        try {
          const newsAnalysis = await MarketOwnedNewsAnalysisRuntime.analyze({
            organizationId,
            portfolioId,
            symbol,
            evidenceRows: evidence.evidence,
          });
          if (newsAnalysis.rows?.length) {
            const updated = new Map(newsAnalysis.rows.map((row) => [row.id, row]));
            scoredEvidence = evidence.evidence.map((row) => updated.get(row.id) || row);
          }
        } catch (newsAnalysisError) {
          errors.push({
            symbol,
            stage: "NEWS_ANALYSIS",
            error: clean(newsAnalysisError?.message || newsAnalysisError || "MARKETS_NEWS_ANALYSIS_UNAVAILABLE").slice(0, 500),
          });
        }

        const cycle = await MarketSpecialistAgentRuntime.persistCycle({
          organizationId,
          portfolioId,
          symbol,
          bars: evidence.bars,
          evidence: scoredEvidence,
          filings: evidence.filings,
          fundamentals: evidence.fundamentals,
          snapshot,
          modelVersion: "markets-v1-autonomous-paper",
        });
        decisionsCreated += 1;

        let decision = cycle.decision;
        const side = clean(decision.action).toUpperCase();

        let strategyReadiness = evaluateStrategyReadiness({
          action: side,
          automationPolicy,
          backtest: null,
        });

        if (side === "BUY" && automationPolicy.require_walk_forward_validation !== false) {
          let backtest = await latestBacktestRun({
            organizationId,
            portfolioId,
            symbol,
          });

          if (backtestRefreshRequired(backtest, automationPolicy)) {
            try {
              const validation = await MarketWalkForwardRuntime.run({
                organizationId,
                portfolioId,
                symbol,
                trainingBars: 80,
                testBars: 20,
                transactionCostBps: 10,
                initialEquity: 100000,
              });
              backtest = validation.run;
            } catch (validationError) {
              errors.push({
                symbol,
                stage: "WALK_FORWARD_VALIDATION",
                error: clean(validationError?.message || validationError || "MARKETS_WALK_FORWARD_FAILED").slice(0, 500),
              });
            }
          }

          strategyReadiness = evaluateStrategyReadiness({
            action: side,
            automationPolicy,
            backtest,
          });

          const { data: readinessDecision, error: readinessDecisionError } = await supabaseAdmin
            .from("market_decisions")
            .update({
              decision_payload: {
                ...(decision.decision_payload || {}),
                strategy_readiness: {
                  ...strategyReadiness,
                  backtest_run_id: backtest?.id || null,
                },
              },
              risk_status: strategyReadiness.ready ? decision.risk_status : "REJECTED",
              risk_reasons: strategyReadiness.ready
                ? (decision.risk_reasons || [])
                : strategyReadiness.reasons,
            })
            .eq("id", decision.id)
            .eq("organization_id", organizationId)
            .select("*")
            .single();
          if (readinessDecisionError) throw readinessDecisionError;
          decision = readinessDecision;

          if (!strategyReadiness.ready) {
            skipped.push({
              symbol,
              reason: "STRATEGY_NOT_READY",
              details: strategyReadiness.reasons,
            });
            continue;
          }
        }

        if (side === "BUY") {
          const outcomeLimit = Math.max(
            number(automationPolicy.strategy_health_min_samples, 20),
            50,
          );
          const recentOutcomes = await recentPredictionOutcomes({
            organizationId,
            portfolioId,
            symbol,
            limit: outcomeLimit,
          });
          const strategyHealth = evaluateStrategyDrift({
            action: side,
            automationPolicy,
            outcomes: recentOutcomes,
          });

          const { data: healthDecision, error: healthDecisionError } = await supabaseAdmin
            .from("market_decisions")
            .update({
              decision_payload: {
                ...(decision.decision_payload || {}),
                strategy_health: strategyHealth,
              },
              risk_status: strategyHealth.ready ? decision.risk_status : "REJECTED",
              risk_reasons: strategyHealth.ready
                ? (decision.risk_reasons || [])
                : [
                    ...(decision.risk_reasons || []),
                    ...(strategyHealth.reasons || []),
                  ],
            })
            .eq("id", decision.id)
            .eq("organization_id", organizationId)
            .select("*")
            .single();
          if (healthDecisionError) throw healthDecisionError;
          decision = healthDecision;

          if (!strategyHealth.ready) {
            skipped.push({
              symbol,
              reason: "STRATEGY_DRIFT_DETECTED",
              details: strategyHealth.reasons,
            });
            continue;
          }
        }

        const price = latestPrice(snapshot, side);
        const position = state.positions.find(
          (row) => clean(row.symbol).toUpperCase() === symbol,
        ) || null;
        const marked = side === "BUY"
          ? markPortfolioForCircuitBreaker({
              account: state.account,
              positions: state.positions,
              liveSnapshots: state.liveBySymbol,
              maxAgeSeconds: number(
                state.riskPolicy?.max_market_data_age_seconds,
                120,
              ),
            })
          : markPortfolio({
              account: state.account,
              positions: state.positions,
              snapshots: state.latestBySymbol,
            });

        if (side === "BUY" && !marked.approved) {
          skipped.push({
            symbol,
            reason: "PORTFOLIO_MARK_AUTHORITY_UNAVAILABLE",
            details: marked.reasons,
          });
          continue;
        }

        const candidateRiskMetrics = historicalRiskMetrics(
          returnsFromBars(evidence.bars || []),
          0.95,
        );
        let sizing = calculateAutonomousPaperOrder({
          decision,
          automationPolicy,
          riskPolicy: state.riskPolicy,
          account: { ...state.account, equity: marked.equity },
          position,
          marketPrice: price,
          candidateAnnualizedVolatilityPct: candidateRiskMetrics.annualized_volatility_pct,
          marketRegimeSizingScale: number(
            decision?.decision_payload?.market_regime?.sizing_scale,
            1,
          ),
        });

        if (!sizing.executable) {
          skipped.push({ symbol, reason: sizing.reason });
          continue;
        }

        const currentPositionValue = number(position?.quantity, 0) * number(price, 0);
        let preBudgetPortfolioRisk = null;
        let portfolioRiskBudget = null;

        if (sizing.side === "BUY") {
          preBudgetPortfolioRisk = await MarketPortfolioRiskRuntime.evaluate({
            organizationId,
            portfolioId,
            policy: state.riskPolicy,
            equity: marked.equity,
            positions: marked.positions,
            proposed: {
              symbol,
              side: sizing.side,
              notional: sizing.notional,
            },
          });
          portfolioRiskBudget = calculatePortfolioRiskBudgetScale({
            metrics: preBudgetPortfolioRisk.metrics || {},
            policy: state.riskPolicy,
            softLimitStart: 0.7,
            minimumScale: 0.25,
          });
          sizing = applyPortfolioRiskBudgetToSizing({
            sizing,
            riskBudget: portfolioRiskBudget,
            equity: marked.equity,
            heldValue: currentPositionValue,
          });

          if (!sizing.executable) {
            skipped.push({ symbol, reason: sizing.reason });
            continue;
          }
        }

        const executionRisk = evaluatePaperTradeRisk({
          policy: state.riskPolicy,
          decision,
          portfolio: {
            equity: marked.equity,
            current_position_value: currentPositionValue,
            daily_pnl: marked.dailyPnl,
            drawdown_pct: marked.drawdownPct,
          },
          order: {
            side: sizing.side,
            notional: sizing.notional,
          },
        });
        const portfolioRisk = await MarketPortfolioRiskRuntime.evaluate({
          organizationId,
          portfolioId,
          policy: state.riskPolicy,
          equity: marked.equity,
          positions: marked.positions,
          proposed: {
            symbol,
            side: sizing.side,
            notional: sizing.notional,
          },
        });
        const recentFills = await rolling24hPaperFills({
          organizationId,
          portfolioId,
        });
        const recentSellFills = await recentRealizedSellFills({
          organizationId,
          portfolioId,
        });
        const tradingBudget = summarizeRollingTradingBudget({
          fills: recentFills,
          equity: marked.equity,
          proposedSide: sizing.side,
          proposedNotional: sizing.notional,
          policy: state.riskPolicy,
        });
        const cashReserve = evaluateCashReserve({
          action: sizing.side,
          cashBalance: state.account?.cash_balance,
          equity: marked.equity,
          proposedNotional: sizing.notional,
          policy: state.riskPolicy,
        });
        const openPositionLimit = evaluateOpenPositionLimit({
          action: sizing.side,
          positions: marked.positions,
          proposedSymbol: symbol,
          policy: state.riskPolicy,
        });
        const lossStreakCooloff = evaluateLossStreakCooloff({
          action: sizing.side,
          fills: recentSellFills,
          policy: state.riskPolicy,
        });
        const symbolLossReentry = evaluateSymbolLossReentryLockout({
          action: sizing.side,
          proposedSymbol: symbol,
          fills: recentSellFills,
          policy: state.riskPolicy,
        });
        const microstructureRisk = evaluateMarketMicrostructureRisk({
          policy: state.riskPolicy,
          snapshot,
          side: sizing.side,
        });
        const corporateActionRisk = await MarketCorporateActionRiskRuntime.evaluate({
          organizationId,
          portfolioId,
          symbol,
          policy: state.riskPolicy,
          side: sizing.side,
        });
        const allApproved =
          executionRisk.approved &&
          portfolioRisk.approved &&
          tradingBudget.approved &&
          cashReserve.approved &&
          openPositionLimit.approved &&
          lossStreakCooloff.approved &&
          symbolLossReentry.approved &&
          microstructureRisk.approved &&
          corporateActionRisk.approved;
        const risk = {
          approved: allApproved,
          status: allApproved ? "APPROVED_PAPER" : "REJECTED",
          reasons: [
            ...(executionRisk.reasons || []),
            ...(portfolioRisk.reasons || []),
            ...(tradingBudget.reasons || []),
            ...(cashReserve.reasons || []),
            ...(openPositionLimit.reasons || []),
            ...(lossStreakCooloff.reasons || []),
            ...(symbolLossReentry.reasons || []),
            ...(microstructureRisk.reasons || []),
            ...(corporateActionRisk.reasons || []),
          ],
          snapshot: {
            ...(executionRisk.snapshot || {}),
            portfolio_concentration: portfolioRisk.metrics || {},
            portfolio_risk_budget: portfolioRiskBudget
              ? {
                  ...portfolioRiskBudget,
                  pre_budget_metrics: preBudgetPortfolioRisk?.metrics || {},
                  pre_budget_notional: sizing.pre_risk_budget_notional ?? sizing.notional,
                  post_budget_notional: sizing.notional,
                }
              : null,
            trading_budget_24h: tradingBudget.metrics || {},
            cash_reserve: cashReserve.metrics || {},
            open_position_limit: openPositionLimit.metrics || {},
            loss_streak_cooloff: lossStreakCooloff.metrics || {},
            symbol_loss_reentry: symbolLossReentry.metrics || {},
            market_microstructure: microstructureRisk.metrics || {},
            corporate_action_risk: corporateActionRisk.metrics || {},
          },
        };

        const { data: riskDecision, error: riskDecisionError } = await supabaseAdmin
          .from("market_decisions")
          .update({
            risk_status: risk.status,
            risk_reasons: risk.reasons,
          })
          .eq("id", decision.id)
          .eq("organization_id", organizationId)
          .select("*")
          .single();
        if (riskDecisionError) throw riskDecisionError;

        if (!risk.approved) {
          skipped.push({ symbol, reason: "RISK_REJECTED", details: risk.reasons });
          continue;
        }

        const order = await createPaperOrder({
          organizationId,
          portfolioId,
          decision: riskDecision,
          sizing,
          risk,
        });
        ordersCreated += 1;

        const fill = await MarketPaperExecutionRuntime.processOrder({
          organizationId,
          portfolioId,
          order,
          slippageBps: 5,
          feeAmount: 0,
        });
        if (fill.filled) {
          executionSlices += 1;
          if (fill.result?.order_status === "FILLED") ordersFilled += 1;
        }

        state = await loadAutomationState({ organizationId, portfolioId });
      } catch (symbolError) {
        errors.push({
          symbol,
          error: clean(symbolError?.message || symbolError || "AUTOMATION_SYMBOL_FAILED").slice(0, 500),
        });
      }
    }

    const finalAuthoritative = markPortfolioForCircuitBreaker({
      account: state.account,
      positions: state.positions,
      liveSnapshots: state.liveBySymbol,
      maxAgeSeconds: number(
        state.riskPolicy?.max_market_data_age_seconds,
        120,
      ),
    });
    const finalMarked = finalAuthoritative.approved
      ? finalAuthoritative
      : markPortfolio({
          account: state.account,
          positions: state.positions,
          snapshots: state.latestBySymbol,
        });
    await MarketPortfolioPerformanceRuntime.recordSnapshot({
      organizationId,
      portfolioId,
      sourceType: "CYCLE",
      sourceId: run.id,
      markedPortfolio: finalMarked,
      metadata: {
        symbols_considered: symbolsConsidered,
        orders_created: ordersCreated,
        orders_filled: ordersFilled,
      },
    });

    const learning = await MarketPredictionOutcomeRuntime.evaluateMatured({
      organizationId,
      portfolioId,
      limit: 100,
    });

    return finishAutomationRun(run.id, {
      status: errors.length ? "COMPLETED" : "COMPLETED",
      symbols_considered: symbolsConsidered,
      decisions_created: decisionsCreated,
      orders_created: ordersCreated,
      orders_filled: ordersFilled,
      outcomes_scored: learning.evaluated,
      skipped,
      errors,
      metadata: {
        execution_mode: "PAPER",
        live_execution_enabled: false,
        execution_slices: executionSlices,
      },
    });
  } catch (error) {
    errors.push({ error: clean(error?.message || error || "AUTOMATION_CYCLE_FAILED").slice(0, 500) });
    await finishAutomationRun(run.id, {
      status: "FAILED",
      symbols_considered: symbolsConsidered,
      decisions_created: decisionsCreated,
      orders_created: ordersCreated,
      orders_filled: ordersFilled,
      skipped,
      errors,
    }).catch(() => {});
    throw error;
  }
}

export const MarketAutonomousPaperRuntime = {
  runCycle: runAutonomousPaperCycle,
};

export async function runDueAutonomousPaperCycles({
  limit = 10,
  now = new Date(),
} = {}) {
  const boundedLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();

  const { data: policies, error: policyError } = await supabaseAdmin
    .from("market_automation_policies")
    .select("*")
    .eq("auto_paper_enabled", true)
    .eq("kill_switch", false)
    .order("updated_at", { ascending: true })
    .limit(boundedLimit);
  if (policyError) throw policyError;

  const results = [];
  for (const policy of policies || []) {
    const portfolioId = policy.portfolio_id;
    const organizationId = policy.organization_id;

    try {
      const [{ data: portfolio, error: portfolioError }, { data: latestRun, error: runError }] = await Promise.all([
        supabaseAdmin
          .from("market_portfolios")
          .select("id,organization_id,status,execution_mode")
          .eq("id", portfolioId)
          .eq("organization_id", organizationId)
          .maybeSingle(),
        supabaseAdmin
          .from("market_automation_runs")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("portfolio_id", portfolioId)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (portfolioError) throw portfolioError;
      if (runError) throw runError;

      if (!portfolio || portfolio.status !== "ACTIVE" || portfolio.execution_mode !== "PAPER") {
        results.push({
          organization_id: organizationId,
          portfolio_id: portfolioId,
          status: "SKIPPED",
          reason: "PORTFOLIO_NOT_ACTIVE_PAPER",
        });
        continue;
      }

      const intervalMs = Math.max(60, number(policy.cycle_interval_seconds, 300)) * 1000;
      if (latestRun?.started_at) {
        const lastStartedMs = new Date(latestRun.started_at).getTime();
        if (latestRun.status === "RUNNING" && Number.isFinite(lastStartedMs) && (nowMs - lastStartedMs) < Math.max(intervalMs * 2, 10 * 60 * 1000)) {
          results.push({
            organization_id: organizationId,
            portfolio_id: portfolioId,
            status: "SKIPPED",
            reason: "RUN_IN_PROGRESS",
          });
          continue;
        }
        if (Number.isFinite(lastStartedMs) && (nowMs - lastStartedMs) < intervalMs) {
          results.push({
            organization_id: organizationId,
            portfolio_id: portfolioId,
            status: "SKIPPED",
            reason: "NOT_DUE",
          });
          continue;
        }
      }

      const run = await runAutonomousPaperCycle({
        organizationId,
        portfolioId,
      });
      results.push({
        organization_id: organizationId,
        portfolio_id: portfolioId,
        status: run.status,
        run_id: run.id,
        orders_created: run.orders_created,
        orders_filled: run.orders_filled,
      });
    } catch (error) {
      results.push({
        organization_id: organizationId,
        portfolio_id: portfolioId,
        status: "FAILED",
        error: clean(error?.message || error || "AUTONOMOUS_PAPER_BATCH_FAILED").slice(0, 500),
      });
    }
  }

  return {
    success: results.every((row) => row.status !== "FAILED"),
    processed: results.length,
    completed: results.filter((row) => row.status === "COMPLETED").length,
    skipped: results.filter((row) => row.status === "SKIPPED").length,
    failed: results.filter((row) => row.status === "FAILED").length,
    results,
    generated_at: new Date(nowMs).toISOString(),
  };
}

MarketAutonomousPaperRuntime.runDue = runDueAutonomousPaperCycles;
