import { NextResponse } from "next/server";

import { PaymentExecutionRuntime } from "@/lib/platform/payment-runtime/execution/PaymentExecutionRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function cleanValue(value) {
  const normalized = String(value ?? "").trim();

  if (
    !normalized ||
    normalized === "undefined" ||
    normalized === "null"
  ) {
    return null;
  }

  return normalized;
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
    const organizationId = cleanValue(
      body.organization_id || body.organizationId,
    );
    const entityId = cleanValue(
      body.entity_id || body.entityId,
    );

    if (!organizationId) {
      return errorResponse("organization_id required", 400);
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    if (entityId) {
      const { data: entity, error: entityError } = await supabaseAdmin
        .from("legal_entities")
        .select("id")
        .eq("id", entityId)
        .eq("organization_id", access.organizationId)
        .maybeSingle();

      if (entityError) throw entityError;

      if (!entity) {
        return errorResponse(
          "Entity is not available for this organization",
          400,
        );
      }
    }

    const payment = await PaymentExecutionRuntime.createPayment({
      organizationId: access.organizationId,
      entityId,
      partyId: cleanValue(body.party_id || body.partyId),
      method: body.payment_method || body.paymentMethod,
      country: body.country,
      amount: body.amount,
      currency: body.currency,
      metadata: body.metadata || {},
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      payment,
    });
  } catch (error) {
    console.error("PLATFORM_PAYMENT_CREATE_ERROR", error);
    return errorResponse(error?.message || "Payment creation failed");
  }
}
