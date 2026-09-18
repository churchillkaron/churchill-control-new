export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
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
    };
  }

  const [watchlistResult, decisionsResult, ordersResult, policyResult, evidenceResult, thesesResult] = await Promise.all([
    supabaseAdmin.from("market_watchlist").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).neq("status", "REMOVED").order("added_at", { ascending: false }),
    supabaseAdmin.from("market_decisions").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("market_paper_orders").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).order("submitted_at", { ascending: false }).limit(50),
    supabaseAdmin.from("market_risk_policies").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).maybeSingle(),
    supabaseAdmin.from("market_evidence_events").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).order("observed_at", { ascending: false }).limit(50),
    supabaseAdmin.from("market_agent_theses").select("*").eq("organization_id", organizationId).eq("portfolio_id", portfolio.id).order("generated_at", { ascending: false }).limit(50),
  ]);

  for (const result of [watchlistResult, decisionsResult, ordersResult, policyResult, evidenceResult, thesesResult]) {
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

  const side = clean(body.side || decision.action).toUpperCase();
  if (!["BUY", "SELL"].includes(side)) throw new Error("Paper order side must be BUY or SELL");
  const quantity = Number(body.quantity);
  const requestedPrice = Number(body.requested_price || body.requestedPrice);
  if (!(quantity > 0) || !(requestedPrice > 0)) throw new Error("Quantity and requested price must be greater than zero");

  const notional = quantity * requestedPrice;
  const risk = evaluatePaperTradeRisk({
    policy: state.riskPolicy || {},
    decision,
    portfolio: {
      equity: Number(body.portfolio_equity || 0),
      current_position_value: Number(body.current_position_value || 0),
      daily_pnl: Number(body.daily_pnl || 0),
      drawdown_pct: Number(body.drawdown_pct || 0),
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

  const { data: order, error: orderError } = await supabaseAdmin.from("market_paper_orders").insert({
    organization_id: organizationId,
    portfolio_id: state.portfolio.id,
    decision_id: decision.id,
    symbol: decision.symbol,
    side,
    order_type: clean(body.order_type || "MARKET").toUpperCase(),
    quantity,
    limit_price: body.limit_price ?? null,
    requested_price: requestedPrice,
    status: "QUEUED",
    risk_snapshot: risk.snapshot,
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

    if (action === "RECORD_DECISION") {
      const decision = await recordDecision({ organizationId, portfolioId: state.portfolio.id, body });
      return NextResponse.json({ success: true, decision });
    }

    if (action === "SUBMIT_PAPER_ORDER") {
      const result = await submitPaperOrder({ organizationId, state, body });
      return NextResponse.json({ success: true, ...result }, { status: result.approved ? 200 : 409 });
    }

    return NextResponse.json({ success: false, error: "Unsupported Markets action" }, { status: 400 });
  } catch (error) {
    console.error("MARKETS_COMMAND_CENTER_POST_FAILED", error);
    return NextResponse.json({ success: false, error: error?.message || "Unable to update Markets" }, { status: 500 });
  }
}
