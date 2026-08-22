import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { WalletRepository } from "@/lib/platform/service-runtime/wallet/repositories/WalletRepository";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import { resolveProvider } from "@/lib/platform/service-runtime/providers/ProviderResolver";
import { PricingRuntime } from "@/lib/platform/service-runtime/pricing/PricingRuntime";
import { resolveServiceCapabilities } from "@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver";
import { resolvePrimaryExecutionCapability } from "@/lib/platform/service-runtime/services/resolver/CapabilityExecutionResolver";

const USAGE_TABLE = "platform_service_usage";
const AUTONOMOUS_REASONING_SERVICE = "ai.text.generate";
const WINDOW_MS = 24 * 60 * 60 * 1000;
const REASONING_OPERATIONS = new Set([
  "SYNTHESIZE_BUSINESS_THESIS",
]);
const COMPLETED_STATUSES = new Set(["COMPLETED", "COMPLETE", "SUCCESS", "SUCCEEDED"]);

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function nonNegative(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return numeric;
}

function positiveInteger(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function currency(value) {
  const normalized = text(value, 12).toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

export function normalizeAutonomousCognitionBudget(projectState = {}) {
  const source = object(projectState?.business_watch?.cognition_budget);
  return {
    enabled: source.enabled !== false,
    rolling_window_hours: 24,
    customer_spend_limit:
      nonNegative(
        source.customer_spend_limit ?? source.rolling_24h_customer_spend_limit,
        null,
      ),
    currency: currency(source.currency),
    paid_reasoning_pass_limit:
      positiveInteger(
        source.paid_reasoning_pass_limit ?? source.rolling_24h_paid_reasoning_pass_limit,
        null,
      ),
    minimum_wallet_balance:
      nonNegative(source.minimum_wallet_balance, 0),
    deep_reasoning_on_change: source.deep_reasoning_on_change !== false,
  };
}

function reasoningUsage(row) {
  const metadata = object(row?.metadata);
  const operation = text(metadata.operation, 120).toUpperCase();
  if (metadata.autonomous_cognition !== true) return false;
  if (!REASONING_OPERATIONS.has(operation)) return false;
  if (text(row?.module, 80).toUpperCase() !== "OPERATOR") return false;
  return true;
}

function usageSpend(rows, budgetCurrency) {
  let passes = 0;
  let completedPasses = 0;
  let spend = 0;
  const spendByCurrency = {};

  for (const row of rows) {
    if (!reasoningUsage(row)) continue;
    passes += 1;
    const status = text(row?.status, 80).toUpperCase();
    if (!COMPLETED_STATUSES.has(status)) continue;
    completedPasses += 1;
    const amount = nonNegative(row?.customer_price, 0) || 0;
    const rowCurrency = currency(row?.currency) || "UNKNOWN";
    spendByCurrency[rowCurrency] = Number(
      ((spendByCurrency[rowCurrency] || 0) + amount).toFixed(6),
    );
    if (!budgetCurrency || rowCurrency === budgetCurrency) spend += amount;
  }

  return {
    paid_reasoning_passes: passes,
    completed_reasoning_passes: completedPasses,
    customer_spend: Number(spend.toFixed(6)),
    spend_by_currency: spendByCurrency,
  };
}

async function loadRollingUsage(organizationId, nowMs) {
  const windowStartedAt = new Date(nowMs - WINDOW_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from(USAGE_TABLE)
    .select("id,module,status,customer_price,currency,metadata,created_at")
    .eq("organization_id", organizationId)
    .eq("module", "OPERATOR")
    .gte("created_at", windowStartedAt)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) throw error;
  return {
    rows: list(data),
    window_started_at: windowStartedAt,
    window_ends_at: new Date(nowMs).toISOString(),
  };
}

function walletSnapshot(wallet) {
  if (!wallet?.id) {
    return {
      exists: false,
      id: null,
      status: null,
      billing_policy: null,
      currency: null,
      available_balance: 0,
      reserved_balance: 0,
    };
  }
  return {
    exists: true,
    id: wallet.id,
    status: text(wallet.status, 80).toUpperCase() || null,
    billing_policy: text(wallet.billing_policy, 80).toUpperCase() || null,
    currency: currency(wallet.currency),
    available_balance: nonNegative(wallet.available_balance, 0) || 0,
    reserved_balance: nonNegative(wallet.reserved_balance, 0) || 0,
  };
}

async function estimateNextReasoningPrice({ organizationId, walletCurrency }) {
  const organizationService = await OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: AUTONOMOUS_REASONING_SERVICE,
  });
  if (!organizationService) {
    throw new Error("AUTONOMOUS_COGNITION_SERVICE_NOT_ENABLED");
  }
  if (text(organizationService.status, 80).toUpperCase() !== "ACTIVE") {
    throw new Error("AUTONOMOUS_COGNITION_SERVICE_NOT_ACTIVE");
  }
  if (organizationService.usage_enabled === false) {
    throw new Error("AUTONOMOUS_COGNITION_SERVICE_USAGE_DISABLED");
  }

  const serviceCapabilities = resolveServiceCapabilities(AUTONOMOUS_REASONING_SERVICE);
  const executionCapability = resolvePrimaryExecutionCapability(
    serviceCapabilities?.capabilities || [],
  );
  if (!executionCapability) {
    throw new Error("AUTONOMOUS_COGNITION_EXECUTION_CAPABILITY_UNAVAILABLE");
  }

  const selectedProvider = await resolveProvider({
    organization_id: organizationId,
    capability: executionCapability,
    country: null,
    currency: walletCurrency,
    policy: organizationService.provider_policy || {},
  });
  const pricing = PricingRuntime.resolveRecord({
    pricing: selectedProvider.pricing_record,
    provider: selectedProvider.provider,
    model: selectedProvider.model,
    capability: executionCapability,
    currency: walletCurrency,
  });

  return {
    service_id: AUTONOMOUS_REASONING_SERVICE,
    capability: executionCapability,
    provider: selectedProvider.provider,
    model: selectedProvider.model || null,
    pricing_id: pricing.pricing_id,
    currency: pricing.currency,
    estimated_customer_price: nonNegative(pricing.customer_price, 0) || 0,
    estimated: pricing.estimated === true,
    zero_price: pricing.zero_price === true,
  };
}

function budgetReason({ budget, wallet, usage, nextPrice }) {
  if (!budget.enabled) return "AUTONOMOUS_COGNITION_DISABLED";
  if (!wallet.exists) return "AUTONOMOUS_COGNITION_WALLET_UNAVAILABLE";
  if (wallet.status !== "ACTIVE") return "AUTONOMOUS_COGNITION_WALLET_INACTIVE";
  if (wallet.billing_policy !== "PREPAID") {
    return "AUTONOMOUS_COGNITION_PREPAID_WALLET_REQUIRED";
  }
  if (
    budget.paid_reasoning_pass_limit !== null &&
    usage.paid_reasoning_passes >= budget.paid_reasoning_pass_limit
  ) {
    return "AUTONOMOUS_COGNITION_PASS_BUDGET_REACHED";
  }
  if (!nextPrice) return "AUTONOMOUS_COGNITION_PRICE_UNAVAILABLE";
  if (
    budget.currency &&
    nextPrice.currency &&
    budget.currency !== nextPrice.currency
  ) {
    return "AUTONOMOUS_COGNITION_BUDGET_CURRENCY_MISMATCH";
  }

  const estimatedPrice = nonNegative(nextPrice.estimated_customer_price, 0) || 0;
  const spendAfterNext = Number((usage.customer_spend + estimatedPrice).toFixed(6));
  const balanceAfterNext = Number((wallet.available_balance - estimatedPrice).toFixed(6));

  if (
    budget.customer_spend_limit !== null &&
    spendAfterNext > budget.customer_spend_limit
  ) {
    return "AUTONOMOUS_COGNITION_SPEND_BUDGET_WOULD_EXCEED";
  }
  if (balanceAfterNext < budget.minimum_wallet_balance) {
    return "AUTONOMOUS_COGNITION_WALLET_FLOOR_WOULD_BREACH";
  }
  if (estimatedPrice > wallet.available_balance) {
    return "AUTONOMOUS_COGNITION_WALLET_INSUFFICIENT_FOR_ESTIMATE";
  }
  return null;
}

export async function evaluateAutonomousCognitionBudget({
  organizationId,
  projectState = {},
  now = new Date(),
} = {}) {
  const organization = text(organizationId, 120);
  if (!organization) {
    throw new Error("AUTONOMOUS_COGNITION_ORGANIZATION_REQUIRED");
  }

  const nowMs = now instanceof Date ? now.getTime() : Date.now();
  const budget = normalizeAutonomousCognitionBudget(projectState);
  const wallet = walletSnapshot(
    await WalletRepository.getByOrganization(organization),
  );
  const effectiveCurrency = budget.currency || wallet.currency;
  const rolling = await loadRollingUsage(organization, nowMs);
  const usage = usageSpend(rolling.rows, effectiveCurrency);

  let nextPrice = null;
  let priceError = null;
  if (
    budget.enabled &&
    wallet.exists &&
    wallet.status === "ACTIVE" &&
    wallet.billing_policy === "PREPAID"
  ) {
    try {
      nextPrice = await estimateNextReasoningPrice({
        organizationId: organization,
        walletCurrency: effectiveCurrency,
      });
    } catch (error) {
      priceError = text(error?.message || error, 240) || "AUTONOMOUS_COGNITION_PRICE_UNAVAILABLE";
    }
  }

  const reason =
    priceError ||
    budgetReason({
      budget,
      wallet,
      usage,
      nextPrice,
    });

  return {
    allowed: !reason,
    reason,
    policy: {
      ...budget,
      currency: effectiveCurrency,
    },
    wallet,
    next_reasoning_price: nextPrice,
    usage: {
      ...usage,
      window_started_at: rolling.window_started_at,
      window_ends_at: rolling.window_ends_at,
    },
  };
}

export function cognitionBudgetSummary(decision = {}) {
  const estimatedNextPrice =
    decision?.next_reasoning_price?.estimated_customer_price ?? null;
  const spendAfterNext = estimatedNextPrice === null
    ? null
    : Number(
        ((decision?.usage?.customer_spend || 0) + estimatedNextPrice).toFixed(6),
      );
  const balanceAfterNext = estimatedNextPrice === null
    ? null
    : Number(
        ((decision?.wallet?.available_balance || 0) - estimatedNextPrice).toFixed(6),
      );

  return {
    allowed: decision?.allowed === true,
    reason: text(decision?.reason, 240) || null,
    currency: decision?.policy?.currency || null,
    customer_spend_limit: decision?.policy?.customer_spend_limit ?? null,
    customer_spend_rolling_24h: decision?.usage?.customer_spend ?? 0,
    estimated_next_reasoning_price: estimatedNextPrice,
    estimated_spend_after_next: spendAfterNext,
    paid_reasoning_pass_limit:
      decision?.policy?.paid_reasoning_pass_limit ?? null,
    paid_reasoning_passes_rolling_24h:
      decision?.usage?.paid_reasoning_passes ?? 0,
    wallet_available_balance:
      decision?.wallet?.available_balance ?? 0,
    estimated_wallet_balance_after_next: balanceAfterNext,
    minimum_wallet_balance:
      decision?.policy?.minimum_wallet_balance ?? 0,
    provider: decision?.next_reasoning_price?.provider || null,
    model: decision?.next_reasoning_price?.model || null,
    pricing_id: decision?.next_reasoning_price?.pricing_id || null,
    window_started_at: decision?.usage?.window_started_at || null,
    window_ends_at: decision?.usage?.window_ends_at || null,
  };
}
