import {
  corporateActionIsDue,
  normalizeCorporateActionAdjustment,
  paperQuantityFromFills,
  sameOrLaterFillExists,
} from "@/lib/markets/runtime/MarketCorporateActionAdjustmentModels";
import { MarketPortfolioPerformanceRuntime } from "@/lib/markets/runtime/MarketPortfolioPerformanceRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

function dateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

async function recordResolution({
  organizationId,
  portfolioId,
  action,
  normalized,
  status,
  reason,
}) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("market_corporate_action_adjustments")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("portfolio_id", portfolioId)
    .eq("corporate_action_id", action.id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const row = {
    organization_id: organizationId,
    portfolio_id: portfolioId,
    corporate_action_id: action.id,
    symbol: clean(action.symbol).toUpperCase(),
    adjustment_type: normalized.adjustment_type,
    status,
    effective_date: normalized.effective_date,
    entitlement_date: normalized.entitlement_date,
    split_ratio: normalized.split_ratio,
    cash_rate: normalized.cash_rate,
    reason,
    authority_effect: "PAPER_ONLY",
    applied_at: status === "UNRESOLVED" || status === "SKIPPED"
      ? new Date().toISOString()
      : null,
    before_snapshot: {},
    after_snapshot: {},
  };

  const { data, error } = await supabaseAdmin
    .from("market_corporate_action_adjustments")
    .insert(row)
    .select("*")
    .single();
  if (error) {
    if (String(error.code || "") === "23505") {
      const { data: duplicate, error: duplicateError } = await supabaseAdmin
        .from("market_corporate_action_adjustments")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("portfolio_id", portfolioId)
        .eq("corporate_action_id", action.id)
        .maybeSingle();
      if (duplicateError) throw duplicateError;
      if (duplicate) return duplicate;
    }
    throw error;
  }
  return data;
}

async function loadAdjustmentState({ organizationId, portfolioId }) {
  const [actionsResult, adjustmentsResult, fillsResult] = await Promise.all([
    supabaseAdmin
      .from("market_corporate_actions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .order("event_date", { ascending: true }),
    supabaseAdmin
      .from("market_corporate_action_adjustments")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("market_paper_fills")
      .select("id,symbol,side,quantity,filled_at")
      .eq("organization_id", organizationId)
      .eq("portfolio_id", portfolioId)
      .order("filled_at", { ascending: true }),
  ]);
  if (actionsResult.error) throw actionsResult.error;
  if (adjustmentsResult.error) throw adjustmentsResult.error;
  if (fillsResult.error) throw fillsResult.error;

  return {
    actions: actionsResult.data || [],
    adjustments: adjustmentsResult.data || [],
    fills: fillsResult.data || [],
  };
}

export async function applyDuePaperCorporateActions({
  organizationId,
  portfolioId,
  now = new Date(),
}) {
  const state = await loadAdjustmentState({ organizationId, portfolioId });
  const resolvedIds = new Set(state.adjustments.map((row) => row.corporate_action_id));
  const results = [];

  for (const action of state.actions) {
    if (resolvedIds.has(action.id)) continue;

    const normalized = normalizeCorporateActionAdjustment(action);
    if (!corporateActionIsDue({ normalized, now })) continue;

    if (!normalized.supported) {
      const row = await recordResolution({
        organizationId,
        portfolioId,
        action,
        normalized,
        status: "SKIPPED",
        reason: normalized.unresolved_reason || "ACCOUNTING_ADJUSTMENT_TYPE_UNSUPPORTED",
      });
      results.push({ action_id: action.id, status: row.status, reason: row.reason });
      continue;
    }

    if (normalized.unresolved_reason) {
      const row = await recordResolution({
        organizationId,
        portfolioId,
        action,
        normalized,
        status: "UNRESOLVED",
        reason: normalized.unresolved_reason,
      });
      results.push({ action_id: action.id, status: row.status, reason: row.reason });
      continue;
    }

    if (normalized.adjustment_type === "SPLIT") {
      if (sameOrLaterFillExists({
        fills: state.fills,
        symbol: action.symbol,
        eventDate: normalized.effective_date,
      })) {
        const row = await recordResolution({
          organizationId,
          portfolioId,
          action,
          normalized,
          status: "UNRESOLVED",
          reason: "SPLIT_TIMING_AMBIGUOUS_AFTER_EVENT_FILL",
        });
        results.push({ action_id: action.id, status: row.status, reason: row.reason });
        continue;
      }

      const { data, error } = await supabaseAdmin.rpc(
        "market_apply_paper_split_adjustment",
        {
          p_organization_id: organizationId,
          p_portfolio_id: portfolioId,
          p_corporate_action_id: action.id,
          p_symbol: clean(action.symbol).toUpperCase(),
          p_ratio: normalized.split_ratio,
          p_effective_date: normalized.effective_date,
        },
      );
      if (error) throw error;
      results.push({ action_id: action.id, ...data });

      if (data?.status === "APPLIED") {
        state.adjustments.push({
          corporate_action_id: action.id,
          adjustment_type: "SPLIT",
          status: "APPLIED",
          effective_date: normalized.effective_date,
          split_ratio: normalized.split_ratio,
        });
        await MarketPortfolioPerformanceRuntime.recordSnapshot({
          organizationId,
          portfolioId,
          sourceType: "MARK",
          sourceId: data.adjustment_id,
          metadata: {
            corporate_action_id: action.id,
            corporate_action_type: action.action_type,
            adjustment_type: "SPLIT",
          },
        });
      }
      continue;
    }

    if (normalized.adjustment_type === "CASH_DIVIDEND") {
      const priorAppliedSplit = state.adjustments.some((row) => (
        row.status === "APPLIED" &&
        row.adjustment_type === "SPLIT" &&
        row.effective_date &&
        normalized.entitlement_date &&
        dateOnly(row.effective_date) < dateOnly(normalized.entitlement_date)
      ));

      if (priorAppliedSplit) {
        const row = await recordResolution({
          organizationId,
          portfolioId,
          action,
          normalized,
          status: "UNRESOLVED",
          reason: "DIVIDEND_ENTITLEMENT_HISTORY_REQUIRES_SPLIT_ADJUSTED_FILLS",
        });
        results.push({ action_id: action.id, status: row.status, reason: row.reason });
        continue;
      }

      const entitlementCutoff = normalized.entitlement_date + "T00:00:00.000Z";
      const entitlementQuantity = paperQuantityFromFills({
        fills: state.fills,
        symbol: action.symbol,
        beforeTime: entitlementCutoff,
      });
      if (entitlementQuantity === null) {
        const row = await recordResolution({
          organizationId,
          portfolioId,
          action,
          normalized,
          status: "UNRESOLVED",
          reason: "DIVIDEND_ENTITLEMENT_QUANTITY_UNPROVEN",
        });
        results.push({ action_id: action.id, status: row.status, reason: row.reason });
        continue;
      }

      const cashAmount = entitlementQuantity * normalized.cash_rate;
      const { data, error } = await supabaseAdmin.rpc(
        "market_apply_paper_cash_adjustment",
        {
          p_organization_id: organizationId,
          p_portfolio_id: portfolioId,
          p_corporate_action_id: action.id,
          p_symbol: clean(action.symbol).toUpperCase(),
          p_entitlement_date: normalized.entitlement_date,
          p_effective_date: normalized.effective_date,
          p_entitlement_quantity: entitlementQuantity,
          p_cash_rate: normalized.cash_rate,
          p_amount: cashAmount,
        },
      );
      if (error) throw error;
      results.push({ action_id: action.id, ...data });

      if (data?.status === "APPLIED") {
        await MarketPortfolioPerformanceRuntime.recordSnapshot({
          organizationId,
          portfolioId,
          sourceType: "MARK",
          sourceId: data.adjustment_id,
          metadata: {
            corporate_action_id: action.id,
            corporate_action_type: action.action_type,
            adjustment_type: "CASH_DIVIDEND",
            entitlement_quantity: entitlementQuantity,
            cash_rate: normalized.cash_rate,
            cash_amount: cashAmount,
          },
        });
      }
    }
  }

  return {
    processed: results.length,
    applied: results.filter((row) => row.status === "APPLIED").length,
    unresolved: results.filter((row) => row.status === "UNRESOLVED").length,
    skipped: results.filter((row) => row.status === "SKIPPED").length,
    results,
    authority_effect: "PAPER_ONLY",
  };
}

export const MarketCorporateActionAdjustmentRuntime = {
  applyDue: applyDuePaperCorporateActions,
};
