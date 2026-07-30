import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

function readValue(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

function normalizeItemIds(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
}

function errorResponse(error, status = 500) {
  return Response.json(
    {
      success: false,
      error,
    },
    { status }
  );
}

export async function settleTablePayment(request, { partial }) {
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
      return errorResponse(access.error, access.status || 403);
    }

    const tableNumber = readValue(body, "tableNumber", "table_number");
    const paymentMethod = readValue(
      body,
      "paymentMethod",
      "payment_method"
    );
    const amount = Number(
      readValue(body, "paidAmount", "paid_amount") ?? body.amount ?? 0
    );
    const idempotencyKey =
      request.headers.get("idempotency-key") ||
      readValue(body, "idempotencyKey", "idempotency_key");
    const itemIds = normalizeItemIds(
      body.itemIds ?? body.item_ids ?? []
    );

    if (tableNumber === null || tableNumber === undefined || tableNumber === "") {
      return errorResponse("tableNumber required", 400);
    }

    if (!paymentMethod) {
      return errorResponse("paymentMethod required", 400);
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return errorResponse("payment amount must be greater than zero", 400);
    }

    if (!idempotencyKey) {
      return errorResponse("idempotencyKey required", 400);
    }

    const actorId = access.user?.id || access.staff?.id || null;
    const { data, error } = await supabaseAdmin.rpc(
      "restaurant_settle_table_atomic",
      {
        p_organization_id: access.organizationId,
        p_table_number: String(tableNumber),
        p_amount: amount,
        p_payment_method: String(paymentMethod),
        p_partial: Boolean(partial),
        p_item_ids: itemIds.length ? itemIds : null,
        p_idempotency_key: String(idempotencyKey),
        p_actor_id: actorId,
      }
    );

    if (error) {
      const functionMissing =
        error.code === "PGRST202" ||
        /restaurant_settle_table_atomic/i.test(error.message || "");

      if (functionMissing) {
        return errorResponse(
          "Atomic restaurant settlement is not deployed in the database",
          503
        );
      }

      return errorResponse(error.message || "Payment settlement failed", 400);
    }

    return Response.json({
      success: true,
      ...(data || {}),
    });
  } catch (error) {
    return errorResponse(error?.message || "Payment settlement failed", 500);
  }
}
