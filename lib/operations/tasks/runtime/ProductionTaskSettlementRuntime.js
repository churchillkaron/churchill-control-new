function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function text(value) {
  return String(value ?? "").trim();
}

function firstNumber(...values) {
  for (const value of values) {
    const number = nonNegativeNumber(value);
    if (number !== null) return number;
  }
  return null;
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    const number = positiveNumber(value);
    if (number !== null) return number;
  }
  return null;
}

export function resolveProductionTaskSettlement(output = {}) {
  const settlement = object(output.wallet_settlement);
  const usage = object(output.usage);
  const usageMetadata = object(usage.metadata);
  const usageMetadataSettlement = object(usageMetadata.wallet_settlement);
  const usageSettledPricing = object(usageMetadata.settled_pricing);
  const billing = object(output.billing);
  const billedUsage = object(billing.usage);
  const billedUsageMetadata = object(billedUsage.metadata);
  const billedUsageMetadataSettlement = object(
    billedUsageMetadata.wallet_settlement,
  );
  const billedUsageSettledPricing = object(
    billedUsageMetadata.settled_pricing,
  );
  const pricing = object(output.pricing);
  const submission = object(output.provider_submission);
  const submissionSettlement = object(submission.wallet_settlement);
  const submissionUsage = object(submission.usage);
  const submissionUsageMetadata = object(submissionUsage.metadata);
  const submissionUsageMetadataSettlement = object(
    submissionUsageMetadata.wallet_settlement,
  );
  const submissionUsageSettledPricing = object(
    submissionUsageMetadata.settled_pricing,
  );
  const submissionBilling = object(submission.billing);
  const submissionBilledUsage = object(submissionBilling.usage);
  const submissionBilledUsageMetadata = object(
    submissionBilledUsage.metadata,
  );
  const submissionBilledUsageMetadataSettlement = object(
    submissionBilledUsageMetadata.wallet_settlement,
  );
  const submissionBilledUsageSettledPricing = object(
    submissionBilledUsageMetadata.settled_pricing,
  );
  const submissionPricing = object(submission.pricing);
  const charged = text(output.settlement).toUpperCase() === "CHARGED";

  const explicitChargedAmount = firstPositiveNumber(
    settlement.charged_amount,
    usage.charged_amount,
    billedUsage.charged_amount,
    submissionSettlement.charged_amount,
    submissionUsage.charged_amount,
    submissionBilledUsage.charged_amount,
    usageMetadataSettlement.charged_amount,
    billedUsageMetadataSettlement.charged_amount,
    submissionUsageMetadataSettlement.charged_amount,
    submissionBilledUsageMetadataSettlement.charged_amount,
  );

  const chargedCustomerPrice = charged
    ? firstPositiveNumber(
        usage.customer_price,
        billedUsage.customer_price,
        pricing.customer_price,
        submissionUsage.customer_price,
        submissionBilledUsage.customer_price,
        submissionPricing.customer_price,
        usageSettledPricing.customer_price,
        billedUsageSettledPricing.customer_price,
        submissionUsageSettledPricing.customer_price,
        submissionBilledUsageSettledPricing.customer_price,
      )
    : null;

  const explicitZeroSettlement = charged
    ? firstNumber(
        settlement.charged_amount,
        usage.charged_amount,
        billedUsage.charged_amount,
        submissionSettlement.charged_amount,
        submissionUsage.charged_amount,
        submissionBilledUsage.charged_amount,
        usageMetadataSettlement.charged_amount,
        billedUsageMetadataSettlement.charged_amount,
        submissionUsageMetadataSettlement.charged_amount,
        submissionBilledUsageMetadataSettlement.charged_amount,
        usage.customer_price,
        billedUsage.customer_price,
        pricing.customer_price,
        submissionUsage.customer_price,
        submissionBilledUsage.customer_price,
        submissionPricing.customer_price,
      )
    : null;

  const chargedAmount =
    explicitChargedAmount ??
    chargedCustomerPrice ??
    explicitZeroSettlement;

  const walletTransactionId = text(
    settlement.wallet_transaction_id ||
    settlement.charge_transaction_id ||
    submissionSettlement.wallet_transaction_id ||
    submissionSettlement.charge_transaction_id ||
    usageMetadataSettlement.wallet_transaction_id ||
    usageMetadataSettlement.charge_transaction_id ||
    billedUsageMetadataSettlement.wallet_transaction_id ||
    billedUsageMetadataSettlement.charge_transaction_id ||
    submissionUsageMetadataSettlement.wallet_transaction_id ||
    submissionUsageMetadataSettlement.charge_transaction_id ||
    submissionBilledUsageMetadataSettlement.wallet_transaction_id ||
    submissionBilledUsageMetadataSettlement.charge_transaction_id ||
    usage.wallet_transaction_id ||
    billedUsage.wallet_transaction_id ||
    submissionUsage.wallet_transaction_id ||
    submissionBilledUsage.wallet_transaction_id,
  ) || null;

  const usageId = text(
    usage.id ||
    billedUsage.id ||
    submissionUsage.id ||
    submissionBilledUsage.id,
  ) || null;

  return {
    charged_amount: chargedAmount,
    wallet_transaction_id: walletTransactionId,
    usage_id: usageId,
    settled: chargedAmount !== null,
  };
}

export function applyProductionTaskSettlement(task = {}, output = {}) {
  const resolved = resolveProductionTaskSettlement(output);
  if (!resolved.settled) {
    return {
      cost: task.cost || {},
      metadata: task.metadata || {},
    };
  }

  return {
    cost: {
      ...(task.cost || {}),
      actual: resolved.charged_amount,
    },
    metadata: {
      ...(task.metadata || {}),
      service_settlement: {
        contract: "CREATIVE_PRODUCTION_TASK_SERVICE_SETTLEMENT_V1",
        charged_amount: resolved.charged_amount,
        currency:
          task.cost?.currency ||
          output.pricing?.currency ||
          output.usage?.currency ||
          output.provider_submission?.pricing?.currency ||
          null,
        usage_id: resolved.usage_id,
        wallet_transaction_id: resolved.wallet_transaction_id,
        mirrored_at: new Date().toISOString(),
      },
    },
  };
}

export const ProductionTaskSettlementRuntime = Object.freeze({
  resolve: resolveProductionTaskSettlement,
  apply: applyProductionTaskSettlement,
});