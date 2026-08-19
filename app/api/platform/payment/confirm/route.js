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

export async function POST(request) {
  if (!authorized(request)) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const body = await request.json();
    const paymentId = cleanValue(body.payment_id || body.paymentId);
    const verificationSource = cleanValue(
      body.verification_source || body.verificationSource,
    );
    const sourceReference = cleanValue(
      body.source_reference || body.sourceReference,
    );

    if (!paymentId) {
      return errorResponse("payment_id required", 400);
    }

    if (!verificationSource) {
      return errorResponse("verification_source required", 400);
    }

    if (!sourceReference) {
      return errorResponse("source_reference required", 400);
    }

    const existingPayment = await PaymentTransactionRepository.get(paymentId);

    if (!existingPayment?.organization_id) {
      return errorResponse("Payment not found", 404);
    }

    const payment = await PaymentConfirmationRuntime.confirmPayment({
      paymentId,
      verificationSource,
      sourceReference,
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
