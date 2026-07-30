import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireValue(value, name) {
  if (value === null || value === undefined || value === "") {
    throw new Error(`${name} required`);
  }

  return value;
}

function requireUuid(value, name) {
  const normalized = String(requireValue(value, name)).trim();

  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${name} must be a valid UUID`);
  }

  return normalized;
}

export function validate({ payload }) {
  const fromTableId = requireUuid(payload?.fromTableId, "fromTableId");
  const toTableId = requireUuid(payload?.toTableId, "toTableId");
  const seatPosition = Number(requireValue(payload?.seatPosition, "seatPosition"));

  if (fromTableId === toTableId) {
    throw new Error("Cannot move a seat to the same table");
  }

  if (!Number.isInteger(seatPosition) || seatPosition < 1) {
    throw new Error("seatPosition must be a positive integer");
  }

  return true;
}

export function authorize({ context }) {
  if (!context?.organizationId) {
    throw new Error("organizationId required");
  }

  if (!context?.actor?.id) {
    throw new Error("Authenticated actor required");
  }

  return true;
}

export async function execute({ context, payload }) {
  const organizationId = requireUuid(
    context.organizationId,
    "organizationId"
  );
  const fromTableId = requireUuid(payload.fromTableId, "fromTableId");
  const toTableId = requireUuid(payload.toTableId, "toTableId");
  const seatPosition = Number(payload.seatPosition);
  const actorId =
    context.actor?.staffAccountId || context.actor?.id || null;

  const result = await supabaseAdmin.rpc("restaurant_move_seat_atomic", {
    p_organization_id: organizationId,
    p_from_table_id: fromTableId,
    p_to_table_id: toTableId,
    p_seat_position: seatPosition,
    p_actor_id:
      typeof actorId === "string" && UUID_PATTERN.test(actorId)
        ? actorId
        : null,
  });

  if (result.error) {
    const unavailable =
      result.error.code === "PGRST202" ||
      /restaurant_move_seat_atomic/i.test(result.error.message || "");

    if (unavailable) {
      const error = new Error(
        "Atomic restaurant seat movement is not deployed in the database"
      );
      error.status = 503;
      throw error;
    }

    const error = new Error(result.error.message || "Move seat failed");
    error.status = 409;
    throw error;
  }

  const movement = result.data || {};

  if (movement.success === false) {
    const error = new Error(movement.error || "Move seat failed");
    error.status = 409;
    throw error;
  }

  return {
    ...movement,
    fromTableId: movement.fromTableId || fromTableId,
    toTableId: movement.toTableId || toTableId,
    seatPosition: Number(movement.seatPosition || seatPosition),
    movedItems: Number(movement.movedItems || 0),
    sourceOrderIds: movement.sourceOrderIds || [],
    sourceTotals: movement.sourceTotals || {},
    targetOrderId: movement.targetOrderId || null,
    targetSessionId: movement.targetSessionId || null,
    targetTotal: Number(movement.targetTotal || 0),
  };
}
