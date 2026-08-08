function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
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

export function resolveProductionTaskSettlement(output = {}) {
  const settlement = object(output.wallet_settlement);
  const usage = object(output.usage);
  const billing = object(output.billing);
  const billedUsage = object(billing.usage);
  const pricing = object(output.pricing);
  const submission = object(output.provider_submission);
  const submissionSettlement = object(submission.wallet_settlement);
  const submissionUsage = object(submission.usage);
  const submissionBilling = object(submission.billing);
  const submissionBilledUsage = object(submissionBilling.usage);

  const chargedAmount = firstNumber(
    settlement.charged_amount,
    usage.charged_amount,
    billedUsage.charged_amount,
    submissionSettlement.charged_amount,
    submissionUsage.charged_amount,
    submissionBilledUsage.charged_amount,
    output.settlement === "CHARGED" ? usage.customer_price : null,
    output.settlement === "CHARGED" ? billedUsage.customer_price : null,
    output.settlement === "CHARGED" ? pricing.customer_price : null,
  );

  const walletTransactionId = text(
    settlement.wallet_transaction_id ||
    settlement.charge_transaction_id ||
    submissionSettlement.wallet_transaction_id ||
    submissionSettlement.charge_transaction_id ||
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
        currency: task.cost?.currency || output.pricing?.currency || output.usage?.currency || null,
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
