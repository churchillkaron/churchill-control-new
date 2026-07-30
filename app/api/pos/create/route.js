export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolvePOSFinancialPolicy } from "@/lib/pos/runtime/resolvePOSFinancialPolicy";
import { runEventProcessors } from "@/lib/workers/system/runEventProcessors";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuidOrNull(value) {
  return typeof value === "string" && UUID_PATTERN.test(value)
    ? value
    : null;
}

function readValue(source, camelKey, snakeKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null;
}

function normalizeItems(items) {
  return items.map((item) => {
    const seatPosition =
      item.seatPosition ??
      item.seat_position ??
      item.modifiers?.seat ??
      null;
    const parsedSeat = Number(seatPosition);
    const parsedQuantity = Number(item.quantity ?? 1);
    const parsedPrice = Number(item.price ?? 0);

    if (!Number.isInteger(parsedSeat) || parsedSeat < 1) {
      throw new Error("Every item must have a valid seat");
    }

    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      throw new Error("Every item must have a valid quantity");
    }

    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      throw new Error("Every item must have a valid price");
    }

    const itemName =
      item.item_name ||
      item.name ||
      item.dish_name ||
      item.title ||
      null;

    if (!itemName || !String(itemName).trim()) {
      throw new Error("Every item must have a name");
    }

    return {
      dish_id: uuidOrNull(item.dish_id || item.dishId || item.id),
      item_name: String(itemName).trim(),
      quantity: parsedQuantity,
      price: parsedPrice,
      station: item.station || null,
      notes: item.notes || null,
      cooking_level: item.cookingLevel || item.cooking_level || null,
      seat_position: parsedSeat,
      modifiers:
        item.modifiers && typeof item.modifiers === "object"
          ? item.modifiers
          : null,
    };
  });
}

function errorResponse(error, status) {
  return Response.json(
    {
      success: false,
      error,
    },
    { status }
  );
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
      return errorResponse(access.error, access.status || 403);
    }

    const organizationId = access.organizationId;
    const tableId = uuidOrNull(readValue(body, "tableId", "table_id"));
    const tableNumber =
      body.table ?? body.tableNumber ?? body.table_number ?? null;
    const sourceItems = Array.isArray(body.items) ? body.items : [];

    if (!tableId && (tableNumber === null || tableNumber === undefined)) {
      return errorResponse("Missing table", 400);
    }

    if (!sourceItems.length) {
      return errorResponse("No items", 400);
    }

    const items = normalizeItems(sourceItems);
    const transactionDate = new Date().toISOString();
    const financialPolicy = await resolvePOSFinancialPolicy({
      organizationId,
      transactionDate,
    });
    const actorStaffId = uuidOrNull(
      access.access?.staffAccountId ||
        access.staff?.id ||
        access.user?.id ||
        null
    );
    const actorName =
      access.staff?.display_name ||
      access.staff?.name ||
      access.user?.email ||
      null;
    const idempotencyKey =
      body.idempotencyKey ||
      body.idempotency_key ||
      request.headers.get("idempotency-key") ||
      `pos-order:${organizationId}:${crypto.randomUUID()}`;

    const rpcResult = await supabaseAdmin.rpc("pos_create_order_atomic", {
      p_organization_id: organizationId,
      p_table_id: tableId,
      p_table_number:
        tableNumber === null || tableNumber === undefined
          ? null
          : String(tableNumber),
      p_items: items,
      p_customer_id: uuidOrNull(
        readValue(body, "customerId", "customer_id")
      ),
      p_customer_name: readValue(body, "customerName", "customer_name"),
      p_customer_email: readValue(body, "customerEmail", "customer_email"),
      p_customer_phone: readValue(body, "customerPhone", "customer_phone"),
      p_guest_count: Math.max(
        0,
        Number(readValue(body, "guestCount", "guest_count") || 0)
      ),
      p_staff_id: actorStaffId,
      p_staff_name: actorName,
      p_service_charge_rate: Number(
        financialPolicy.serviceChargeRate || 0
      ),
      p_tax_rate: Number(financialPolicy.taxRate || 0),
      p_prices_include_tax: Boolean(financialPolicy.pricesIncludeTax),
      p_tax_code_id: uuidOrNull(financialPolicy.taxCodeId),
      p_tax_code: financialPolicy.taxCode || null,
      p_idempotency_key: String(idempotencyKey),
    });

    if (rpcResult.error) {
      const unavailable =
        rpcResult.error.code === "PGRST202" ||
        /pos_create_order_atomic/i.test(rpcResult.error.message || "");

      if (unavailable) {
        return errorResponse(
          "Atomic POS transaction is not deployed in the database",
          503
        );
      }

      throw rpcResult.error;
    }

    const transaction = rpcResult.data || {};
    const eventId = uuidOrNull(transaction.event_id);
    let dispatchPending = false;
    let dispatchError = null;

    if (!transaction.duplicate) {
      if (!eventId) {
        dispatchPending = true;
        dispatchError =
          "Atomic POS transaction did not return an event identity";
      } else {
        try {
          const dispatch = await runEventProcessors({
            organizationId,
            eventId,
            limit: 1,
          });

          dispatchPending =
            dispatch?.success === false ||
            Number(dispatch?.failed || 0) > 0 ||
            (Array.isArray(dispatch?.failures) &&
              dispatch.failures.length > 0);
          dispatchError = dispatchPending
            ? dispatch?.failures?.[0]?.error ||
              dispatch?.error ||
              "Event dispatch incomplete"
            : null;
        } catch (error) {
          dispatchPending = true;
          dispatchError = error?.message || "Event dispatch failed";
        }
      }
    }

    return Response.json({
      success: true,
      order_id: transaction.order_id,
      session_id: transaction.session_id,
      table_id: transaction.table_id || tableId,
      inserted_items: (transaction.inserted_item_ids || []).map((id) => ({
        id,
      })),
      event_id: eventId,
      event_type: transaction.event_type || null,
      idempotency_key: idempotencyKey,
      duplicate: Boolean(transaction.duplicate),
      subtotal: Number(transaction.subtotal || 0),
      service_charge_amount: Number(
        transaction.service_charge_amount || 0
      ),
      tax_amount: Number(transaction.tax_amount || 0),
      total_amount: Number(transaction.total_amount || 0),
      dispatch_pending: dispatchPending,
      dispatch_error: dispatchError,
    });
  } catch (error) {
    console.error("POS CREATE ERROR", error);

    return errorResponse(
      error?.message || "Unable to create POS order",
      error?.status || 500
    );
  }
}
