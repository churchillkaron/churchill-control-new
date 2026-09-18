export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { MarketAutonomousPaperRuntime } from "@/lib/markets/runtime/MarketAutonomousPaperRuntime";
import { MarketIntelligenceIngestionRuntime } from "@/lib/markets/runtime/MarketIntelligenceIngestionRuntime";
import { MarketPaperExecutionRuntime } from "@/lib/markets/runtime/MarketPaperExecutionRuntime";
import { MarketPortfolioRiskRuntime } from "@/lib/markets/runtime/MarketPortfolioRiskRuntime";
import { MarketPredictionOutcomeRuntime } from "@/lib/markets/runtime/MarketPredictionOutcomeRuntime";
import { MarketSpecialistAgentRuntime } from "@/lib/markets/runtime/MarketSpecialistAgentRuntime";
import { MarketWalkForwardRuntime } from "@/lib/markets/runtime/MarketWalkForwardRuntime";
import { evaluatePaperTradeRisk } from "@/lib/markets/runtime/MarketRiskPolicyRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

const MARKETS_AUTOMATION_OWNER_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

function requireMarketsAutomationAuthority(scope) {
  const role = clean(scope?.access?.role || scope?.access?.access?.role).toUpperCase();
  if (!MARKETS_AUTOMATION_OWNER_ROLES.has(role)) {
    const error = new Error("Owner or super-admin authority is required for Markets automation");
    error.status = 403;
    throw error;
  }
}

async function resolveContext(request, source = {}) {
  const organizationId = clean(source.organizationId || source.organization_id);
  const entityId = clean(source.entityId || source.entity_id) || null;
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return { error: access.error, status: access.status || 403 };

  const context = await resolveBusinessContext({
    organizationId: access.organizationId,
    entityId,
    request,
    access,
  });
  if (!context.success) return { error: context.error, status: context.status || 400 };
  return { context, access };
}

async function loadState({ organizationId, entityId }) {
  let portfolioQuery = supabaseAdmin
    .from("market_portfolios")
    .select("*")
    .eq("organization_id", organizationId)
    .neq("status", "ARCHIVED")
    .order("updated_at", { ascending: false })
    .limit(1);

  portfolioQuery = entityId
    ? portfolioQuery.eq("entity_id", entityId)
    : portfolioQuery.is("entity_id", null);
  const { data: portfolio, error: portfolioError } = await portfolioQuery.maybeSingle();
  if (portfolioError) throw portfolioError;

  if (!portfolio) {
    return {
      portfolio: null,
      watchlist: [],
      decisions: [],
      paperOrders: [],
      riskPolicy: null,
      evidence: [],
      theses: [],
      snapshots: [],
      filings: [],
      outcomes: [],
      paperAccount: null,
      paperPositions: [],
      paperFills: [],
      feedStatus: null,
      automationPolicy: null,
      automationRuns: [],
      backtestRuns: [],
    };
  }

  const [watchlistResult, decisionsResult, ordersResult, policyResult, evidenceResult, thesesResult, liveSnapshotsResult, snapshotsResult, filingsResult, outcomesResult, paperAccountResult, paperPositionsResult, paperFillsResult, feedStatusResult, automationPolicyResult, automationRunsResult, backtestRunsResult] = await Promise.all([
    supabaseAdmin.from("market_watchlist").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).neq("status", "REMOVED").order("added_at", { ascending: false }),
    supabaseAdmin.from("market_decisions").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("market_paper_orders").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).order("submitted_at", { ascending: false }).limit(50),
    supabaseAdmin.from("market_risk_policies").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).maybeSingle(),
    supabaseAdmin.from("market_evidence_events").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).order("observed_at", { ascending: false }).limit(100),
    supabaseAdmin.from("market_agent_theses").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).order("generated_at", { ascending: false }).limit(100),
    supabaseAdmin.from("market_live_snapshots").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).order("captured_at", { ascending: false }).limit(100),
    supabaseAdmin.from("market_snapshots").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).order("captured_at", { ascending: false }).limit(100),
    supabaseAdmin.from("market_filings").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).order("filed_at", { ascending: false }).limit(100),
    supabaseAdmin.from("market_prediction_outcomes").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).order("evaluation_time", { ascending: false }).limit(100),
    supabaseAdmin.from("market_paper_accounts").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).maybeSingle(),
    supabaseAdmin.from("market_paper_positions").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).order("market_value", { ascending: false }),
    supabaseAdmin.from("market_paper_fills").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).order("filled_at", { ascending: false }).limit(100),
    supabaseAdmin.from("market_feed_status").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).eq("provider", "alpaca").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("market_automation_policies").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).maybeSingle(),
    supabaseAdmin.from("market_automation_runs").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).order("started_at", { ascending: false }).limit(20),
    supabaseAdmin.from("market_backtest_runs").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).order("started_at", { ascending: false }).limit(50),
  ]);

  for (const result of [watchlistResult, decisionsResult, ordersResult, policyResult, evidenceResult, thesesResult, liveSnapshotsResult, snapshotsResult, filingsResult, outcomesResult, paperAccountResult, paperPositionsResult, paperFillsResult, feedStatusResult, automationPolicyResult, automationRunsResult, backtestRunsResult]) {
    if (result.error) throw result.error;
  }

  return {
    portfolio,
    watchlist: watchlistResult.data || [],
    decisions: decisionsResult.data || [],
    paperOrders: ordersResult.data || [],
    riskPolicy: policyResult.data || null,
    evidence: evidenceResult.data || [],
    theses: thesesResult.data || [],
    snapshots: [
      ...(liveSnapshotsResult.data || []),
      ...(snapshotsResult.data || []),
    ],
    filings: filingsResult.data || [],
    outcomes: outcomesResult.data || [],
    paperAccount: paperAccountResult.data || null,
    paperPositions: paperPositionsResult.data || [],
    paperFills: paperFillsResult.data || [],
    feedStatus: feedStatusResult.data || null,
    automationPolicy: automationPolicyResult.data || null,
    automationRuns: automationRunsResult.data || [],
    backtestRuns: backtestRunsResult.data || [],
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const scope = await resolveContext(request, {
      organizationId: url.searchParams.get("organizationId") || url.searchParams.get("organization_id"),
      entityId: url.searchParams.get("entityId") || url.searchParams.get("entity_id"),
    });
    if (scope.error) return NextResponse.json({ success: false, error: scope.error }, { status: scope.status });

    const state = await loadState({
      organizationId: scope.context.organizationId,
      entityId: scope.context.entityId || null,
    });

    return NextResponse.json({
      success: true,
      context: { organization_id: scope.context.organizationId, entity_id: scope.context.entityId || null },
      execution: { mode: "PAPER", live_enabled: false },
      ...state,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("MARKETS_COMMAND_CENTER_GET_FAILED", error);
    return NextResponse.json({ success: false, error: error?.message || "Unable to load Markets" }, { status: 500 });
  }
}

async function initializePortfolio({ organizationId, entityId, name = "Primary Portfolio", baseCurrency = "USD" }) {
  const existing = await loadState({ organizationId, entityId });
  if (existing.portfolio) return existing;

  const { data: portfolio, error: portfolioError } = await supabaseAdmin
    .from("market_portfolios")
    .insert({
      organization_id: organizationId,
      entity_id: entityId,
      name,
      base_currency: clean(baseCurrency).toUpperCase() || "USD",
      execution_mode: "PAPER",
      status: "ACTIVE",
    })
    .select("*")
    .single();
  if (portfolioError) throw portfolioError;

  const { error: policyError } = await supabaseAdmin.from("market_risk_policies").insert({
    organization_id: organizationId,
    portfolio_id: portfolio.id,
    live_execution_enabled: false,
    require_human_approval: true,
  });
  if (policyError) throw policyError;

  const { error: accountError } = await supabaseAdmin.from("market_paper_accounts").insert({
    organization_id: organizationId,
    portfolio_id: portfolio.id,
    base_currency: clean(baseCurrency).toUpperCase() || "USD",
  });
  if (accountError) throw accountError;

  const { error: automationError } = await supabaseAdmin.from("market_automation_policies").insert({
    organization_id: organizationId,
    portfolio_id: portfolio.id,
    auto_paper_enabled: false,
    kill_switch: false,
  });
  if (automationError) throw automationError;

  return loadState({ organizationId, entityId });
}

async function recordDecision({ organizationId, portfolioId, body }) {
  const action = clean(body.action).toUpperCase();
  const confidence = Number(body.confidence);
  if (!["BUY", "SELL", "HOLD", "NO_ACTION"].includes(action)) throw new Error("Invalid decision action");
  if (!(confidence >= 0 && confidence <= 1)) throw new Error("Decision confidence must be between 0 and 1");

  const { data, error } = await supabaseAdmin.from("market_decisions").insert({
    organization_id: organizationId,
    portfolio_id: portfolioId,
    symbol: clean(body.symbol).toUpperCase(),
    horizon: clean(body.horizon || "MEDIUM").toUpperCase(),
    action,
    confidence,
    expected_return: body.expected_return ?? null,
    downside_risk: body.downside_risk ?? null,
    evidence_ids: Array.isArray(body.evidence_ids) ? body.evidence_ids : [],
    thesis_ids: Array.isArray(body.thesis_ids) ? body.thesis_ids : [],
    decision_payload: body.decision_payload || {},
    risk_status: "PENDING",
  }).select("*").single();
  if (error) throw error;
  return data;
}

async function submitPaperOrder({ organizationId, state, body }) {
  const decisionId = clean(body.decision_id || body.decisionId);
  const decision = state.decisions.find((row) => row.id === decisionId);
  if (!decision) throw new Error("A valid governed decision is required");

  const side = clean(decision.action).toUpperCase();
  if (!["BUY", "SELL"].includes(side)) {
    throw new Error("Only BUY or SELL governed decisions can create paper orders");
  }
  if (decision.expires_at && new Date(decision.expires_at).getTime() <= Date.now()) {
    throw new Error("The governed decision has expired");
  }

  const quantity = Number(body.quantity);
  if (!(quantity > 0)) throw new Error("Quantity must be greater than zero");

  const snapshot = state.snapshots.find((row) => clean(row.symbol).toUpperCase() === clean(decision.symbol).toUpperCase());
  if (!snapshot) throw new Error("Refresh market intelligence before submitting a paper order");

  const priceCandidates = side === "BUY"
    ? [snapshot.ask_price, snapshot.latest_trade_price, snapshot.minute_close, snapshot.day_close]
    : [snapshot.bid_price, snapshot.latest_trade_price, snapshot.minute_close, snapshot.day_close];
  const requestedPrice = priceCandidates
    .map((value) => Number(value))
    .find((value) => Number.isFinite(value) && value > 0);
  if (!(requestedPrice > 0)) throw new Error("Authoritative market price is unavailable");

  let account = state.paperAccount;
  if (!account) {
    const { data, error } = await supabaseAdmin
      .from("market_paper_accounts")
      .insert({
        organization_id: organizationId,
        portfolio_id: state.portfolio.id,
        base_currency: state.portfolio.base_currency || "USD",
      })
      .select("*")
      .single();
    if (error) throw error;
    account = data;
  }

  const today = new Date().toISOString().slice(0, 10);
  if (clean(account.daily_equity_date) !== today) {
    const { data, error } = await supabaseAdmin
      .from("market_paper_accounts")
      .update({
        daily_equity_start: account.equity,
        daily_equity_date: today,
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id)
      .eq("organization_id", organizationId)
      .select("*")
      .single();
    if (error) throw error;
    account = data;
  }

  const latestSnapshotBySymbol = new Map();
  for (const row of state.snapshots) {
    const symbol = clean(row.symbol).toUpperCase();
    if (!latestSnapshotBySymbol.has(symbol)) latestSnapshotBySymbol.set(symbol, row);
  }

  let markedPositionsValue = 0;
  const markedPositions = [];
  for (const position of state.paperPositions) {
    const symbol = clean(position.symbol).toUpperCase();
    const latest = latestSnapshotBySymbol.get(symbol);
    const mark = Number(
      latest?.latest_trade_price
      ?? latest?.minute_close
      ?? latest?.day_close
      ?? position.market_price
      ?? 0,
    );
    const quantityHeld = Number(position.quantity || 0);
    const marketValue = quantityHeld * (Number.isFinite(mark) ? mark : 0);
    markedPositionsValue += marketValue;
    markedPositions.push({
      ...position,
      symbol,
      market_price: Number.isFinite(mark) ? mark : 0,
      market_value: marketValue,
    });
  }

  const equity = Number(account.cash_balance || 0) + markedPositionsValue;
  const dailyEquityStart = Number(account.daily_equity_start || equity);
  const highWaterEquity = Math.max(Number(account.high_water_equity || equity), equity);
  const dailyPnl = equity - dailyEquityStart;
  const drawdownPct = highWaterEquity > 0
    ? Math.max(0, ((highWaterEquity - equity) / highWaterEquity) * 100)
    : 0;

  const position = state.paperPositions.find(
    (row) => clean(row.symbol).toUpperCase() === clean(decision.symbol).toUpperCase(),
  ) || null;
  const heldQuantity = Number(position?.quantity || 0);
  if (side === "SELL" && heldQuantity < quantity) {
    throw new Error("Insufficient paper position for SELL order");
  }

  const notional = quantity * requestedPrice;
  if (side === "BUY" && Number(account.cash_balance || 0) < notional) {
    throw new Error("Insufficient paper cash for BUY order");
  }

  const currentPositionValue = heldQuantity * requestedPrice;
  const executionRisk = evaluatePaperTradeRisk({
    policy: state.riskPolicy || {},
    decision,
    portfolio: {
      equity,
      current_position_value: currentPositionValue,
      daily_pnl: dailyPnl,
      drawdown_pct: drawdownPct,
    },
    order: { side, notional },
  });
  const portfolioRisk = await MarketPortfolioRiskRuntime.evaluate({
    organizationId,
    portfolioId: state.portfolio.id,
    policy: state.riskPolicy || {},
    equity,
    positions: markedPositions,
    proposed: {
      symbol: decision.symbol,
      side,
      notional,
    },
  });
  const riskReasons = [
    ...(executionRisk.reasons || []),
    ...(portfolioRisk.reasons || []),
  ];
  const risk = {
    approved: executionRisk.approved && portfolioRisk.approved,
    status: executionRisk.approved && portfolioRisk.approved
      ? "APPROVED_PAPER"
      : "REJECTED",
    reasons: riskReasons,
    snapshot: {
      ...(executionRisk.snapshot || {}),
      portfolio_concentration: portfolioRisk.metrics || {},
    },
  };

  const { data: updatedDecision, error: decisionError } = await supabaseAdmin
    .from("market_decisions")
    .update({ risk_status: risk.status, risk_reasons: risk.reasons })
    .eq("id", decision.id)
    .eq("organization_id", organizationId)
    .select("*")
    .single();
  if (decisionError) throw decisionError;

  if (!risk.approved) return { approved: false, risk, decision: updatedDecision, order: null };

  const orderType = clean(body.order_type || "MARKET").toUpperCase();
  if (!["MARKET", "LIMIT"].includes(orderType)) throw new Error("Unsupported paper order type");
  const limitPrice = orderType === "LIMIT" ? Number(body.limit_price) : null;
  if (orderType === "LIMIT" && !(limitPrice > 0)) throw new Error("Limit price must be greater than zero");

  const { data: order, error: orderError } = await supabaseAdmin.from("market_paper_orders").insert({
    organization_id: organizationId,
    portfolio_id: state.portfolio.id,
    decision_id: decision.id,
    symbol: clean(decision.symbol).toUpperCase(),
    side,
    order_type: orderType,
    quantity,
    limit_price: limitPrice,
    requested_price: requestedPrice,
    status: "QUEUED",
    risk_snapshot: {
      ...risk.snapshot,
      authoritative_state: true,
      daily_equity_start: dailyEquityStart,
      high_water_equity: highWaterEquity,
      cash_balance: Number(account.cash_balance || 0),
      held_quantity: heldQuantity,
    },
    metadata: { simulation_only: true },
  }).select("*").single();
  if (orderError) throw orderError;
  return { approved: true, risk, decision: updatedDecision, order };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const scope = await resolveContext(request, body || {});
    if (scope.error) return NextResponse.json({ success: false, error: scope.error }, { status: scope.status });

    const organizationId = scope.context.organizationId;
    const entityId = scope.context.entityId || null;
    const action = clean(body.action || "").toUpperCase();

    if (action === "INITIALIZE") {
      const state = await initializePortfolio({
        organizationId,
        entityId,
        name: clean(body.name) || "Primary Portfolio",
        baseCurrency: clean(body.base_currency || body.baseCurrency) || "USD",
      });
      return NextResponse.json({ success: true, execution: { mode: "PAPER", live_enabled: false }, ...state });
    }

    const state = await loadState({ organizationId, entityId });
    if (!state.portfolio) {
      return NextResponse.json({ success: false, error: "Initialize Markets before using this action" }, { status: 409 });
    }

    if (action === "UPDATE_RISK_POLICY") {
      requireMarketsAutomationAuthority(scope);

      const current = state.riskPolicy || {};
      const next = {
        max_position_pct: Number(body.max_position_pct ?? current.max_position_pct ?? 10),
        max_sector_pct: Number(body.max_sector_pct ?? current.max_sector_pct ?? 30),
        max_daily_loss_pct: Number(body.max_daily_loss_pct ?? current.max_daily_loss_pct ?? 2),
        max_portfolio_drawdown_pct: Number(body.max_portfolio_drawdown_pct ?? current.max_portfolio_drawdown_pct ?? 10),
        min_decision_confidence: Number(body.min_decision_confidence ?? current.min_decision_confidence ?? 0.7),
        max_order_notional: body.max_order_notional === "" || body.max_order_notional === null
          ? null
          : Number(body.max_order_notional ?? current.max_order_notional ?? 0) || null,
        max_gross_exposure_pct: Number(body.max_gross_exposure_pct ?? current.max_gross_exposure_pct ?? 100),
        max_correlated_exposure_pct: Number(body.max_correlated_exposure_pct ?? current.max_correlated_exposure_pct ?? 35),
        correlation_threshold: Number(body.correlation_threshold ?? current.correlation_threshold ?? 0.8),
        live_execution_enabled: false,
        updated_at: new Date().toISOString(),
      };

      const percentageChecks = [
        ["Max position", next.max_position_pct, 0, 100],
        ["Sector cap", next.max_sector_pct, 0, 100],
        ["Daily loss", next.max_daily_loss_pct, 0, 100],
        ["Max drawdown", next.max_portfolio_drawdown_pct, 0, 100],
        ["Gross exposure", next.max_gross_exposure_pct, 0, 300],
        ["Correlated exposure", next.max_correlated_exposure_pct, 0, 100],
      ];
      for (const [label, value, minimum, maximum] of percentageChecks) {
        if (!(value > minimum && value <= maximum)) {
          throw new Error(`${label} must be greater than ${minimum} and at most ${maximum}`);
        }
      }
      if (!(next.min_decision_confidence >= 0 && next.min_decision_confidence <= 1)) {
        throw new Error("Minimum decision confidence must be between 0 and 1");
      }
      if (!(next.correlation_threshold >= 0 && next.correlation_threshold <= 1)) {
        throw new Error("Correlation threshold must be between 0 and 1");
      }
      if (next.max_order_notional !== null && !(next.max_order_notional > 0)) {
        throw new Error("Maximum order notional must be greater than zero when configured");
      }

      const { data: riskPolicy, error: riskPolicyError } = await supabaseAdmin
        .from("market_risk_policies")
        .update(next)
        .eq("organization_id", organizationId)
        .eq("portfolio_id", state.portfolio.id)
        .select("*")
        .single();
      if (riskPolicyError) throw riskPolicyError;

      return NextResponse.json({
        success: true,
        riskPolicy,
        execution: { mode: "PAPER", live_enabled: false },
      });
    }

    if (action === "UPDATE_AUTOMATION_POLICY") {
      requireMarketsAutomationAuthority(scope);

      const current = state.automationPolicy || {};
      const next = {
        organization_id: organizationId,
        portfolio_id: state.portfolio.id,
        auto_paper_enabled: body.auto_paper_enabled ?? current.auto_paper_enabled ?? false,
        cycle_interval_seconds: Number(body.cycle_interval_seconds ?? current.cycle_interval_seconds ?? 300),
        target_position_pct: Number(body.target_position_pct ?? current.target_position_pct ?? 2),
        min_confidence: Number(body.min_confidence ?? current.min_confidence ?? 0.75),
        max_trades_per_cycle: Number(body.max_trades_per_cycle ?? current.max_trades_per_cycle ?? 3),
        cooldown_minutes: Number(body.cooldown_minutes ?? current.cooldown_minutes ?? 60),
        allow_buys: body.allow_buys ?? current.allow_buys ?? true,
        allow_sells: body.allow_sells ?? current.allow_sells ?? true,
        kill_switch: body.kill_switch ?? current.kill_switch ?? false,
        updated_at: new Date().toISOString(),
      };

      if (!(next.cycle_interval_seconds >= 60 && next.cycle_interval_seconds <= 86400)) {
        throw new Error("Cycle interval must be between 60 and 86400 seconds");
      }
      if (!(next.target_position_pct > 0 && next.target_position_pct <= 10)) {
        throw new Error("Target position must be greater than 0% and at most 10%");
      }
      if (!(next.min_confidence >= 0 && next.min_confidence <= 1)) {
        throw new Error("Automation confidence must be between 0 and 1");
      }
      if (!(next.max_trades_per_cycle >= 1 && next.max_trades_per_cycle <= 20)) {
        throw new Error("Max trades per cycle must be between 1 and 20");
      }
      if (!(next.cooldown_minutes >= 0 && next.cooldown_minutes <= 10080)) {
        throw new Error("Cooldown must be between 0 and 10080 minutes");
      }

      const { data: automationPolicy, error: automationError } = await supabaseAdmin
        .from("market_automation_policies")
        .upsert(next, { onConflict: "portfolio_id" })
        .select("*")
        .single();
      if (automationError) throw automationError;

      if (body.auto_paper_enabled !== undefined || body.kill_switch !== undefined) {
        const delegated = automationPolicy.auto_paper_enabled === true && automationPolicy.kill_switch !== true;
        const { error: riskAuthorityError } = await supabaseAdmin
          .from("market_risk_policies")
          .update({
            require_human_approval: !delegated,
            updated_at: new Date().toISOString(),
          })
          .eq("organization_id", organizationId)
          .eq("portfolio_id", state.portfolio.id);
        if (riskAuthorityError) throw riskAuthorityError;
      }

      return NextResponse.json({
        success: true,
        automationPolicy,
        execution: { mode: "PAPER", live_enabled: false },
      });
    }

    if (action === "RUN_AUTONOMOUS_PAPER_CYCLE") {
      requireMarketsAutomationAuthority(scope);
      const run = await MarketAutonomousPaperRuntime.runCycle({
        organizationId,
        portfolioId: state.portfolio.id,
      });
      const refreshedState = await loadState({ organizationId, entityId });
      return NextResponse.json({
        success: true,
        run,
        automationPolicy: refreshedState.automationPolicy,
        automationRuns: refreshedState.automationRuns,
        paperAccount: refreshedState.paperAccount,
        paperPositions: refreshedState.paperPositions,
        paperOrders: refreshedState.paperOrders,
        execution: { mode: "PAPER", live_enabled: false },
      });
    }

    if (action === "RUN_WALK_FORWARD") {
      const symbol = clean(body.symbol).toUpperCase();
      if (!symbol) {
        return NextResponse.json({ success: false, error: "symbol is required" }, { status: 400 });
      }
      const known = state.watchlist.some(
        (row) => clean(row.symbol).toUpperCase() === symbol && row.status !== "REMOVED",
      );
      if (!known) {
        return NextResponse.json({ success: false, error: "Symbol must be in the active Markets universe" }, { status: 409 });
      }

      const validation = await MarketWalkForwardRuntime.run({
        organizationId,
        portfolioId: state.portfolio.id,
        symbol,
        trainingBars: Number(body.training_bars || 80),
        testBars: Number(body.test_bars || 20),
        transactionCostBps: Number(body.transaction_cost_bps ?? 10),
        initialEquity: Number(body.initial_equity || 100000),
      });
      const refreshedState = await loadState({ organizationId, entityId });
      return NextResponse.json({
        success: true,
        validation,
        backtestRuns: refreshedState.backtestRuns,
        execution: { mode: "PAPER", live_enabled: false },
      });
    }

    if (action === "ADD_WATCHLIST") {
      const symbol = clean(body.symbol).toUpperCase();
      if (!symbol) return NextResponse.json({ success: false, error: "symbol is required" }, { status: 400 });

      const { data, error } = await supabaseAdmin.from("market_watchlist").insert({
        organization_id: organizationId,
        portfolio_id: state.portfolio.id,
        symbol,
        exchange: clean(body.exchange) || null,
        asset_type: clean(body.asset_type || "EQUITY").toUpperCase(),
        thesis_horizon: clean(body.thesis_horizon || "MEDIUM").toUpperCase(),
      }).select("*").single();
      if (error) throw error;
      return NextResponse.json({ success: true, watchlist_item: data });
    }

    if (action === "REFRESH_INTELLIGENCE") {
      const symbol = clean(body.symbol).toUpperCase();
      if (!symbol) return NextResponse.json({ success: false, error: "symbol is required" }, { status: 400 });

      const start = new Date(Date.now() - (180 * 24 * 60 * 60 * 1000)).toISOString();
      const refreshed = await MarketIntelligenceIngestionRuntime.refreshSymbol({
        organizationId,
        portfolioId: state.portfolio.id,
        symbol,
        exchange: clean(body.exchange) || null,
        cik: clean(body.cik) || null,
        feed: clean(body.feed || "iex"),
        barsStart: clean(body.bars_start) || start,
        barsEnd: clean(body.bars_end) || null,
        barsTimeframe: clean(body.timeframe || "1Day"),
        barsLimit: Number(body.bars_limit || 160),
        newsLimit: Number(body.news_limit || 20),
      });

      const cycle = await MarketSpecialistAgentRuntime.persistCycle({
        organizationId,
        portfolioId: state.portfolio.id,
        symbol,
        bars: refreshed.bars,
        evidence: refreshed.evidence,
        filings: refreshed.filings,
        fundamentals: refreshed.fundamentals,
        snapshot: refreshed.snapshot,
      });

      const outcomeEvaluation = await MarketPredictionOutcomeRuntime.evaluateMatured({
        organizationId,
        portfolioId: state.portfolio.id,
        limit: 100,
      });

      return NextResponse.json({
        success: true,
        refresh: refreshed,
        intelligence: cycle,
        learning: outcomeEvaluation,
        execution: { mode: "PAPER", live_enabled: false },
      });
    }

    if (action === "RECORD_DECISION") {
      const decision = await recordDecision({ organizationId, portfolioId: state.portfolio.id, body });
      return NextResponse.json({ success: true, decision });
    }

    if (action === "SUBMIT_PAPER_ORDER") {
      const result = await submitPaperOrder({ organizationId, state, body });
      return NextResponse.json({ success: true, ...result }, { status: result.approved ? 200 : 409 });
    }

    if (action === "PROCESS_PAPER_ORDERS") {
      const result = await MarketPaperExecutionRuntime.processQueued({
        organizationId,
        portfolioId: state.portfolio.id,
        slippageBps: Number(body.slippage_bps ?? 5),
        feeAmount: Number(body.fee_amount ?? 0),
        limit: Math.min(Math.max(Number(body.limit || 50), 1), 100),
      });
      const refreshedState = await loadState({ organizationId, entityId });
      return NextResponse.json({
        success: true,
        execution: { mode: "PAPER", live_enabled: false },
        processing: result,
        paperAccount: refreshedState.paperAccount,
        paperPositions: refreshedState.paperPositions,
        paperFills: refreshedState.paperFills,
        paperOrders: refreshedState.paperOrders,
      });
    }

    return NextResponse.json({ success: false, error: "Unsupported Markets action" }, { status: 400 });
  } catch (error) {
    console.error("MARKETS_COMMAND_CENTER_POST_FAILED", error);
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to update Markets" },
      { status },
    );
  }
}
