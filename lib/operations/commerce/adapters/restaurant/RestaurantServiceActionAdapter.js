import { execute } from "@/lib/ubte/runtime/ExecutionEngine";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const UBTE_ACTIONS = Object.freeze({
  MOVE_GUESTS: "MoveGuests",
  CLOSE_CONTEXT: "CloseTable",
  CLOSE_TABLE: "CloseTable",
  TRANSFER_CONTEXT: "TransferTable",
  TRANSFER_TABLE: "TransferTable",
  MERGE_CONTEXTS: "MergeTables",
  MERGE_TABLES: "MergeTables",
  MOVE_ASSIGNMENT: "MoveSeat",
  MOVE_SEAT: "MoveSeat",
});

function normalizeAction(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function actorFromAccess(access) {
  return {
    id: access.user?.id || null,
    email: access.user?.email || null,
    staffAccountId:
      access.access?.staffAccountId || access.staff?.id || null,
    role: access.role || null,
  };
}

function restaurantPayload(payload = {}) {
  return {
    ...payload,
    tableId:
      payload.tableId || payload.table_id || payload.contextId || payload.context_id,
    fromTableId:
      payload.fromTableId ||
      payload.from_table_id ||
      payload.fromContextId ||
      payload.from_context_id ||
      payload.sourceContextId ||
      payload.source_context_id,
    toTableId:
      payload.toTableId ||
      payload.to_table_id ||
      payload.toContextId ||
      payload.to_context_id ||
      payload.targetContextId ||
      payload.target_context_id,
    masterTableId:
      payload.masterTableId ||
      payload.master_table_id ||
      payload.masterContextId ||
      payload.master_context_id,
    targetTableIds:
      payload.targetTableIds ||
      payload.target_table_ids ||
      payload.targetContextIds ||
      payload.target_context_ids ||
      payload.contextIds ||
      payload.context_ids,
    seatPosition:
      payload.seatPosition ||
      payload.seat_position ||
      payload.assignmentReference ||
      payload.assignment_reference,
    guestCount:
      payload.guestCount || payload.guest_count || payload.participantCount,
  };
}

async function assignItemsToGroup({ access, organizationId, payload }) {
  const translated = restaurantPayload(payload);
  const tableId = translated.tableId;
  const itemIds = Array.isArray(payload.itemIds || payload.item_ids)
    ? [...new Set((payload.itemIds || payload.item_ids).filter(Boolean))]
    : [];
  const billGroup = String(
    payload.group || payload.groupName || payload.billGroup || payload.bill_group || ""
  ).trim();

  if (!tableId) {
    const error = new Error("contextId required");
    error.status = 400;
    throw error;
  }
  if (!itemIds.length) {
    const error = new Error("itemIds required");
    error.status = 400;
    throw error;
  }
  if (!billGroup) {
    const error = new Error("group required");
    error.status = 400;
    throw error;
  }

  const result = await supabaseAdmin.rpc("restaurant_assign_bill_group_atomic", {
    p_organization_id: organizationId,
    p_table_id: tableId,
    p_item_ids: itemIds,
    p_bill_group: billGroup,
    p_actor_id:
      access.access?.staffAccountId ||
      access.staff?.id ||
      access.user?.id ||
      null,
  });

  if (result.error) {
    const unavailable =
      result.error.code === "PGRST202" ||
      /restaurant_assign_bill_group_atomic/i.test(result.error.message || "");
    if (unavailable) {
      const error = new Error(
        "Atomic bill-group assignment is not deployed in the database"
      );
      error.status = 503;
      throw error;
    }
    throw result.error;
  }

  return {
    ...(result.data || {}),
    context_id: tableId,
    item_ids: itemIds,
    group: billGroup,
  };
}

export async function executeRestaurantServiceAction({
  action,
  access,
  organizationId,
  payload = {},
  compatibilityRoute = null,
}) {
  const normalizedAction = normalizeAction(action);

  if (
    normalizedAction === "ASSIGN_ITEMS_TO_GROUP" ||
    normalizedAction === "UPDATE_BILL_GROUP"
  ) {
    return {
      result: await assignItemsToGroup({ access, organizationId, payload }),
      execution: {
        domain: "restaurant",
        capability: "posTableActions",
        action: "AssignItemsToGroup",
      },
    };
  }

  const ubteAction = UBTE_ACTIONS[normalizedAction];
  if (!ubteAction) {
    const error = new Error(
      normalizedAction
        ? `Unsupported POS context action: ${normalizedAction}`
        : "Missing action"
    );
    error.status = 400;
    throw error;
  }

  const canonicalPayload = {
    ...restaurantPayload(payload),
    organizationId,
    organization_id: organizationId,
  };
  const execution = await execute({
    organizationId,
    domain: "restaurant",
    capability: "posTableActions",
    action: ubteAction,
    payload: canonicalPayload,
    actor: actorFromAccess(access),
    runtime: {
      permissions: access.permissions || [],
      metadata: {
        authenticated: true,
        compatibilityRoute,
        requestedAction: normalizedAction,
      },
    },
  });

  return {
    result: execution.result,
    execution: {
      requestId: execution.context?.requestId || null,
      correlationId: execution.context?.correlationId || null,
      domain: execution.domain,
      capability: execution.capability,
      action: execution.action,
    },
  };
}

const RestaurantServiceActionAdapter = Object.freeze({
  execute: executeRestaurantServiceAction,
});

export default RestaurantServiceActionAdapter;
