import {
  simulatePaperFillPrice,
} from "@/lib/markets/runtime/MarketPaperExecutionModels";
import { evaluatePaperOrderLifecycle } from "@/lib/markets/runtime/MarketPaperOrderLifecycleModels";
import { MarketPortfolioPerformanceRuntime } from "@/lib/markets/runtime/MarketPortfolioPerformanceRuntime";
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

export async function processPaperOrder({
  organizationId,
  portfolioId,
  order,
  slippageBps = 5,
  feeAmount = 0,
}) {
  if (!order?.id) throw new Error("paper order required");
  if (order.status !== "QUEUED") {
    return { filled: false, reason: "ORDER_NOT_QUEUED", order };
  }

  let decision = null;
  if (order.decision_id) {
    const { data, error } = await supabaseAdmin
      .from("market_decisions")
      .select("id,expires_at,risk_status")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .eq("id", order.decision_id)
      .maybeSingle();
    if (error) throw error;
    decision = data || null;
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
      .eq("status", "QUEUED")
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

  const fillPrice = simulatePaperFillPrice({
    side: order.side,
    marketPrice,
    slippageBps,
  });

  const { data, error } = await supabaseAdmin.rpc("market_apply_paper_fill", {
    p_organization_id: organizationId,
    p_order_id: order.id,
    p_fill_price: fillPrice,
    p_fee_amount: feeAmount,
    p_slippage_bps: slippageBps,
  });
  if (error) throw error;

  const equitySnapshot = await MarketPortfolioPerformanceRuntime.recordSnapshot({
    organizationId,
    portfolioId,
    sourceType: "FILL",
    sourceId: order.id,
    metadata: {
      symbol: order.symbol,
      side: order.side,
      fill_price: fillPrice,
      slippage_bps: slippageBps,
      fee_amount: feeAmount,
    },
  });

  return {
    filled: true,
    result: data,
    equity_snapshot: equitySnapshot,
    snapshot_id: snapshot.id,
    market_price: marketPrice,
    fill_price: fillPrice,
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
    .eq("status", "QUEUED")
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
    filled: results.filter((row) => row.filled).length,
    results,
  };
}

export const MarketPaperExecutionRuntime = {
  processOrder: processPaperOrder,
  processQueued: processQueuedPaperOrders,
};
