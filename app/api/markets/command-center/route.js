export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { MarketIntelligenceIngestionRuntime } from "@/lib/markets/runtime/MarketIntelligenceIngestionRuntime";
import { MarketPaperExecutionRuntime } from "@/lib/markets/runtime/MarketPaperExecutionRuntime";
import { MarketPredictionOutcomeRuntime } from "@/lib/markets/runtime/MarketPredictionOutcomeRuntime";
import { MarketSpecialistAgentRuntime } from "@/lib/markets/runtime/MarketSpecialistAgentRuntime";
import { evaluatePaperTradeRisk } from "@/lib/markets/runtime/MarketRiskPolicyRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
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
    };
  }

  const [watchlistResult, decisionsResult, ordersResult, policyResult, evidenceResult, thesesResult, liveSnapshotsResult, snapshotsResult, filingsResult, outcomesResult, paperAccountResult, paperPositionsResult, paperFillsResult, feedStatusResult] = await Promise.all([
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
  ]);

  for (const result of [watchlistResult, decisionsResult, ordersResult, policyResult, evidenceResult, thesesResult, liveSnapshotsResult, snapshotsResult, filingsResult, outcomesResult, paperAccountResult, paperPositionsResult, paperFillsResult, feedStatusResult]) {
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
    markedPositionsValue += quantityHeld * (Number.isFinite(mark) ? mark : 0);
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
  const risk = evaluatePaperTradeRisk({
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
    return NextResponse.json({ success: false, error: error?.message || "Unable to update Markets" }, { status: 500 });
  }
}
