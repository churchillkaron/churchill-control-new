import { supabaseAdmin } from "../../../shared/supabase/admin.js";
import {
  MODAL_H100_GPU,
  MODAL_H100_INFRASTRUCTURE,
  modalH100RateUsdPerSecond,
  modalH100SupplierCostUsd,
} from "./ModalInfrastructureCostPolicy.js";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nestedValue(root, keys, seen = new Set()) {
  if (!root || typeof root !== "object" || seen.has(root)) return null;
  seen.add(root);
  for (const key of keys) {
    if (root[key] !== undefined && root[key] !== null && root[key] !== "") return root[key];
  }
  const children = Array.isArray(root)
    ? root
    : [root.output, root.result, root.raw, root.data, root.provider_result, root.providerResult];
  for (const child of children) {
    const value = nestedValue(child, keys, seen);
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

async function resolveFxRate({ organizationId, settlementCurrency, effectiveDate }) {
  const currency = text(settlementCurrency).toUpperCase() || "THB";
  if (currency === "USD") {
    return { rate: 1, rate_id: null, source: "SAME_CURRENCY", effective_date: effectiveDate };
  }

  const { data, error } = await supabaseAdmin
    .from("finance_exchange_rates")
    .select("id,base_currency,quote_currency,from_currency,to_currency,rate,effective_date,source,status,created_at")
    .eq("organization_id", organizationId)
    .lte("effective_date", effectiveDate)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;

  const active = (data || []).filter((row) =>
    !["INACTIVE", "ARCHIVED", "DISABLED", "SUSPENDED"].includes(text(row.status).toUpperCase())
  );
  const from = (row) => text(row.base_currency || row.from_currency).toUpperCase();
  const to = (row) => text(row.quote_currency || row.to_currency).toUpperCase();

  const direct = active.find((row) => from(row) === "USD" && to(row) === currency && finite(row.rate, 0) > 0);
  if (direct) {
    return {
      rate: Number(direct.rate),
      rate_id: direct.id,
      source: text(direct.source) || "FINANCE_CONFIGURED_DIRECT",
      effective_date: direct.effective_date,
    };
  }

  const inverse = active.find((row) => from(row) === currency && to(row) === "USD" && finite(row.rate, 0) > 0);
  if (inverse) {
    return {
      rate: 1 / Number(inverse.rate),
      rate_id: inverse.id,
      source: text(inverse.source) || "FINANCE_CONFIGURED_INVERSE",
      effective_date: inverse.effective_date,
    };
  }

  throw new Error(`MODAL_ACTUAL_SUPPLIER_COST_FX_REQUIRED:USD:${currency}:${effectiveDate}`);
}

export async function settleModalActualSupplierCost({
  organizationId,
  usageId,
  approvalId = null,
  settlementCurrency = "THB",
  result = {},
  effectiveDate = new Date().toISOString().slice(0, 10),
} = {}) {
  const infrastructure = text(nestedValue(result, ["infrastructure_provider"]));
  const gpu = text(nestedValue(result, ["modal_gpu"]));
  const elapsedSeconds = finite(nestedValue(result, ["modal_elapsed_seconds"]), null);

  if (infrastructure !== MODAL_H100_INFRASTRUCTURE || gpu !== MODAL_H100_GPU || elapsedSeconds === null) {
    return null;
  }
  if (!organizationId || !usageId) throw new Error("MODAL_ACTUAL_SUPPLIER_COST_SCOPE_REQUIRED");

  const rateUsdPerSecond = modalH100RateUsdPerSecond();
  const supplierCostUsd = modalH100SupplierCostUsd({ elapsedSeconds, rateUsdPerSecond });
  const fx = await resolveFxRate({ organizationId, settlementCurrency, effectiveDate });
  const supplierCost = Number((supplierCostUsd * fx.rate).toFixed(6));

  const { data, error } = await supabaseAdmin.rpc("settle_modal_compute_actual_cost", {
    p_organization_id: organizationId,
    p_approval_id: approvalId || null,
    p_usage_id: usageId,
    p_infrastructure_provider: infrastructure,
    p_gpu: gpu,
    p_elapsed_seconds: elapsedSeconds,
    p_gpu_rate_usd_per_second: rateUsdPerSecond,
    p_supplier_cost_usd: supplierCostUsd,
    p_fx_rate: fx.rate,
    p_fx_rate_id: fx.rate_id,
    p_settlement_currency: text(settlementCurrency).toUpperCase() || "THB",
    p_supplier_cost_settlement_currency: supplierCost,
    p_metadata: {
      contract: "MODAL_ACTUAL_SUPPLIER_COST_V1",
      rate_source: "MODAL_PUBLISHED_H100_SXM5",
      fx_source: fx.source,
      effective_date: fx.effective_date,
    },
  });
  if (error) throw error;

  return {
    contract: "MODAL_ACTUAL_SUPPLIER_COST_V1",
    infrastructure_provider: infrastructure,
    gpu,
    elapsed_seconds: elapsedSeconds,
    gpu_rate_usd_per_second: rateUsdPerSecond,
    supplier_cost_usd: supplierCostUsd,
    fx_rate: fx.rate,
    fx_rate_id: fx.rate_id,
    fx_source: fx.source,
    settlement_currency: text(settlementCurrency).toUpperCase() || "THB",
    supplier_cost: supplierCost,
    approval_id: approvalId || null,
    settlement: object(data),
  };
}

export const ModalActualSupplierCostRuntime = Object.freeze({
  settle: settleModalActualSupplierCost,
  calculateH100Usd: modalH100SupplierCostUsd,
});
