import { calculateAutonomousPaperOrder } from "@/lib/markets/runtime/MarketAutonomousPaperModels";
import { MarketPaperExecutionRuntime } from "@/lib/markets/runtime/MarketPaperExecutionRuntime";
import { MarketPredictionOutcomeRuntime } from "@/lib/markets/runtime/MarketPredictionOutcomeRuntime";
import { evaluatePaperTradeRisk } from "@/lib/markets/runtime/MarketRiskPolicyRuntime";
import { MarketSpecialistAgentRuntime } from "@/lib/markets/runtime/MarketSpecialistAgentRuntime";
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

  const snapshots = [...(liveSnapshotsResult.data || []), ...(restSnapshotsResult.data || [])];
  const latestBySymbol = new Map();
  for (const row of snapshots) {
    const symbol = clean(row.symbol).toUpperCase();
    if (!latestBySymbol.has(symbol)) latestBySymbol.set(symbol, row);
  }

  return {
    automationPolicy: policyResult.data || null,
    riskPolicy: riskResult.data || {},
    account: accountResult.data || null,
    positions: positionsResult.data || [],
    watchlist: watchlistResult.data || [],
    latestBySymbol,
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
  const [barsResult, evidenceResult, filingsResult] = await Promise.all([
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
  ]);

  for (const result of [barsResult, evidenceResult, filingsResult]) {
    if (result.error) throw result.error;
  }

  return {
    bars: barsResult.data || [],
    evidence: evidenceResult.data || [],
    filings: filingsResult.data || [],
  };
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

async function hasQueuedOrder({ organizationId, portfolioId, symbol }) {
  const { data, error } = await supabaseAdmin
    .from("market_paper_orders")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .eq("symbol", symbol)
    .eq("status", "QUEUED")
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

async function createPaperOrder({
  organizationId,
  portfolioId,
  decision,
  sizing,
  risk,
}) {
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
      requested_price: sizing.market_price,
      status: "QUEUED",
      risk_snapshot: {
        ...risk.snapshot,
        automation: true,
        sizing: {
          target_position_pct: sizing.target_position_pct,
          minimum_confidence: sizing.minimum_confidence,
        },
      },
      metadata: {
        simulation_only: true,
        autonomous_cycle: true,
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
  let symbolsConsidered = 0;

  try {
    let state = await loadAutomationState({ organizationId, portfolioId });
    const automationPolicy = state.automationPolicy;

    if (!automationPolicy?.auto_paper_enabled || automationPolicy?.kill_switch) {
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

    const maxTrades = Math.max(1, number(automationPolicy.max_trades_per_cycle, 3));

    for (const item of state.watchlist) {
      if (ordersCreated >= maxTrades) break;

      const symbol = clean(item.symbol).toUpperCase();
      if (!symbol) continue;
      symbolsConsidered += 1;

      try {
        const snapshot = state.latestBySymbol.get(symbol);
        if (!snapshot || stale(snapshot, 120)) {
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

        const evidence = await loadSymbolEvidence({
          organizationId,
          portfolioId,
          symbol,
        });
        if (evidence.bars.length < 21) {
          skipped.push({ symbol, reason: "INSUFFICIENT_DAILY_BARS" });
          continue;
        }

        const cycle = await MarketSpecialistAgentRuntime.persistCycle({
          organizationId,
          portfolioId,
          symbol,
          bars: evidence.bars,
          evidence: evidence.evidence,
          filings: evidence.filings,
          snapshot,
          modelVersion: "markets-v1-autonomous-paper",
        });
        decisionsCreated += 1;

        const decision = cycle.decision;
        const side = clean(decision.action).toUpperCase();
        const price = latestPrice(snapshot, side);
        const position = state.positions.find(
          (row) => clean(row.symbol).toUpperCase() === symbol,
        ) || null;
        const marked = markPortfolio({
          account: state.account,
          positions: state.positions,
          snapshots: state.latestBySymbol,
        });

        const sizing = calculateAutonomousPaperOrder({
          decision,
          automationPolicy,
          riskPolicy: state.riskPolicy,
          account: { ...state.account, equity: marked.equity },
          position,
          marketPrice: price,
        });

        if (!sizing.executable) {
          skipped.push({ symbol, reason: sizing.reason });
          continue;
        }

        const currentPositionValue = number(position?.quantity, 0) * number(price, 0);
        const risk = evaluatePaperTradeRisk({
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
        if (fill.filled) ordersFilled += 1;

        state = await loadAutomationState({ organizationId, portfolioId });
      } catch (symbolError) {
        errors.push({
          symbol,
          error: clean(symbolError?.message || symbolError || "AUTOMATION_SYMBOL_FAILED").slice(0, 500),
        });
      }
    }

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
