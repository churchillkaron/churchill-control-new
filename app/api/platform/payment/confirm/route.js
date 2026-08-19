import { NextResponse } from "next/server";

import { PaymentConfirmationRuntime } from "@/lib/platform/payment-runtime/confirmation/PaymentConfirmationRuntime";
import { PaymentTransactionRepository } from "@/lib/platform/payment-runtime/repositories/PaymentTransactionRepository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function errorResponse(error, status = 500) {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    { status },
  );
}

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;

  return (
    (request.headers.get("authorization") || "") === `Bearer ${secret}`
  );
}

function settlementEvidence(body = {}) {
  return {
    provider: cleanValue(body.provider),
    provider_reference: cleanValue(
      body.provider_reference || body.providerReference,
    ),
    amount: body.amount,
    currency: cleanValue(body.currency),
    settled_at: cleanValue(body.settled_at || body.settledAt),
    verification_source: cleanValue(
      body.verification_source || body.verificationSource,
    ),
    metadata:
      body.metadata &&
      typeof body.metadata === "object" &&
      !Array.isArray(body.metadata)
        ? body.metadata
        : {},
  };
}

export async function POST(request) {
  if (!authorized(request)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const body = await request.json();
    const paymentId = cleanValue(body.payment_id || body.paymentId);

    if (!paymentId) {
      return errorResponse("payment_id required", 400);
    }

    const existingPayment = await PaymentTransactionRepository.get(paymentId);

    if (!existingPayment?.organization_id) {
      return errorResponse("Payment not found", 404);
    }

    const payment = await PaymentConfirmationRuntime.confirmPayment({
      paymentId,
      evidence: settlementEvidence(body),
    });

    return NextResponse.json({
      success: true,
      organizationId: existingPayment.organization_id,
      payment,
    });
  } catch (error) {
    console.error("PLATFORM_PAYMENT_CONFIRM_ERROR", error);

    const message = error?.message || "Payment confirmation failed";
    const clientError =
      message.startsWith("PAYMENT_") ||
      message.startsWith("WALLET_");

    return errorResponse(message, clientError ? 400 : 500);
  }
}
