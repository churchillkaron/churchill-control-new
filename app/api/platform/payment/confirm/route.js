import { NextResponse } from "next/server";

import { PaymentConfirmationRuntime } from "@/lib/platform/payment-runtime/confirmation/PaymentConfirmationRuntime";
import { PaymentTransactionRepository } from "@/lib/platform/payment-runtime/repositories/PaymentTransactionRepository";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export const dynamic = "force-dynamic";

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

export async function POST(request) {
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

    const access = await requireOrganizationAccess({
      organizationId: existingPayment.organization_id,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    const payment = await PaymentConfirmationRuntime.confirmPayment({
      paymentId,
      status: cleanValue(body.status) || "completed",
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      payment,
    });
  } catch (error) {
    console.error("PLATFORM_PAYMENT_CONFIRM_ERROR", error);
    return errorResponse(error?.message || "Payment confirmation failed");
  }
}
