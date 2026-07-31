export const dynamic = "force-dynamic";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { loadTablePaymentState } from "@/lib/restaurant/payments/runtime/loadTablePaymentState";

function readValue(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const requestedOrganizationId = readValue(
      body,
      "organizationId",
      "organization_id"
    );
    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
    });

    if (!access.success) {
      return Response.json(
        { success: false, error: access.error },
        { status: access.status || 403 }
      );
    }

    const tableNumber = readValue(body, "tableNumber", "table_number");
    const state = await loadTablePaymentState({
      organizationId: access.organizationId,
      tableNumber,
    });

    return Response.json({
      success: true,
      state,
    });
  } catch (error) {
    console.error("POS PAYMENT STATE ERROR", error);

    return Response.json(
      {
        success: false,
        error: error?.message || "Unable to load payment state",
      },
      { status: 500 }
    );
  }
}
