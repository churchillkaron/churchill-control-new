import {
  BillingRuntime,
} from "../billing/runtime/BillingRuntime";
import {
  UsageRuntime,
} from "../usage/UsageRuntime";
import {
  WalletRuntime,
} from "../wallet/runtime/WalletRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function assertBoundLiveUsage({ usage, organizationId, provider, providerRequestId }) {
  if (!usage?.id || usage.organization_id !== organizationId) {
    throw new Error("LIVE_PROVIDER_USAGE_NOT_FOUND");
  }
  if (text(usage.provider) !== text(provider)) {
    throw new Error("LIVE_PROVIDER_USAGE_PROVIDER_MISMATCH");
  }
  if (text(usage.provider_request_id) !== text(providerRequestId)) {
    throw new Error("LIVE_PROVIDER_USAGE_SESSION_MISMATCH");
  }
  if (text(usage.capability) !== "ai.speech.to.text.realtime") {
    throw new Error("LIVE_PROVIDER_USAGE_CAPABILITY_MISMATCH");
  }
}

function reservationPricing(usage = {}) {
  const pricing = object(usage.metadata?.reservation_pricing);
  if (!text(pricing.pricing_id)) {
    throw new Error("LIVE_PROVIDER_RESERVATION_PRICING_REQUIRED");
  }
  return pricing;
}

async function complete({
  organization_id,
  provider = "openai",
  provider_request_id,
  usage_id,
  metadata = {},
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!provider_request_id) throw new Error("provider_request_id required");
  if (!usage_id) throw new Error("usage_id required");

  const usage = await UsageRuntime.get(usage_id);
  assertBoundLiveUsage({
    usage,
    organizationId: organization_id,
    provider,
    providerRequestId: provider_request_id,
  });

  if (usage.status === "SUCCESS") {
    return {
      success: true,
      already_completed: true,
      usage,
    };
  }
  if (usage.status === "FAILED") {
    throw new Error("LIVE_PROVIDER_USAGE_ALREADY_FAILED");
  }
  if (usage.status !== "PENDING") {
    throw new Error(`LIVE_PROVIDER_USAGE_NOT_PENDING:${usage.status}`);
  }

  const pricing = reservationPricing(usage);
  const chargeAmount = finite(pricing.customer_price);
  const supplierCost = finite(pricing.supplier_cost);
  if (chargeAmount <= 0) {
    throw new Error("LIVE_PROVIDER_FIXED_PRICE_REQUIRED");
  }

  await WalletRuntime.charge({
    organization_id,
    amount: chargeAmount,
    provider,
    usage_id,
    reference: usage_id,
    currency: usage.currency,
    metadata: {
      pricing_id: pricing.pricing_id,
      provider_request_id,
      settlement: "BOUND_LIVE_SESSION_FIXED_PRICE",
    },
  });

  const completedUsage = await UsageRuntime.complete({
    usage_id,
    supplier_cost: supplierCost,
    platform_markup: finite(pricing.platform_markup),
    customer_price: chargeAmount,
    quantity: Number(usage.quantity || 1),
    unit: usage.unit || pricing.unit || "request",
    latency_ms: null,
    metadata: {
      ...object(usage.metadata),
      ...object(metadata),
      provider_request_id,
      provider_status: "completed",
      settled_pricing: pricing,
      wallet_settlement: {
        mode: "CHARGED",
        reserved_amount: chargeAmount,
        charged_amount: chargeAmount,
        released_amount: 0,
        remaining_reserved_amount: 0,
      },
    },
  });

  const billing = await BillingRuntime.billUsage({
    usage_id: completedUsage.id,
  });

  return {
    success: true,
    already_completed: false,
    usage: billing?.usage || completedUsage,
    billing,
  };
}

async function cancel({
  organization_id,
  provider = "openai",
  provider_request_id,
  usage_id,
  reason = "LIVE_PROVIDER_SESSION_CANCELLED",
  metadata = {},
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!provider_request_id) throw new Error("provider_request_id required");
  if (!usage_id) throw new Error("usage_id required");

  const usage = await UsageRuntime.get(usage_id);
  assertBoundLiveUsage({
    usage,
    organizationId: organization_id,
    provider,
    providerRequestId: provider_request_id,
  });

  if (usage.status === "FAILED") {
    return {
      success: true,
      already_cancelled: true,
      usage,
    };
  }
  if (usage.status === "SUCCESS") {
    throw new Error("LIVE_PROVIDER_USAGE_ALREADY_COMPLETED");
  }
  if (usage.status !== "PENDING") {
    throw new Error(`LIVE_PROVIDER_USAGE_NOT_PENDING:${usage.status}`);
  }

  const pricing = reservationPricing(usage);
  const reservedAmount = finite(pricing.customer_price);

  if (reservedAmount > 0) {
    await WalletRuntime.release({
      organization_id,
      amount: reservedAmount,
      provider,
      reference: usage_id,
      currency: usage.currency,
      metadata: {
        pricing_id: pricing.pricing_id,
        provider_request_id,
        settlement: "BOUND_LIVE_SESSION_CANCELLED",
      },
    });
  }

  const failedUsage = await UsageRuntime.fail({
    usage_id,
    error: new Error(text(reason) || "LIVE_PROVIDER_SESSION_CANCELLED"),
    metadata: {
      ...object(usage.metadata),
      ...object(metadata),
      provider_request_id,
      provider_status: "cancelled",
      wallet_settlement: {
        mode: "RELEASED",
        reserved_amount: reservedAmount,
        charged_amount: 0,
        released_amount: reservedAmount,
        remaining_reserved_amount: 0,
      },
    },
  });

  return {
    success: true,
    already_cancelled: false,
    usage: failedUsage,
  };
}

export const LiveProviderSessionRuntime = {
  complete,
  cancel,
};
