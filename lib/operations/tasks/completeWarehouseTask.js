import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

import {
  createInventoryMovement,
} from "@/lib/inventory/movements/createInventoryMovement";

import {
  normalizeInventoryMovementType,
  signedInventoryQuantity,
} from "@/lib/inventory/movements/inventoryMovementSemantics";

const LOCATION_MOVEMENT_TASKS =
  new Set([
    "PUTAWAY",
    "TRANSFER_OUT",
    "TRANSFER_IN",
  ]);

function numeric(
  value
) {
  const parsed =
    Number(
      value || 0
    );

  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
}

function sameNullable(
  left,
  right
) {
  return (
    left ||
    null
  ) === (
    right ||
    null
  );
}

async function loadTaskMovements({
  organizationId,
  taskId,
}) {
  const result =
    await supabaseAdmin
      .from(
        "inventory_movements"
      )
      .select("*")
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "source_module",
        "warehouse"
      )
      .eq(
        "source_document",
        "warehouse_task"
      )
      .eq(
        "source_document_id",
        taskId
      )
      .order(
        "created_at",
        {
          ascending:
            true,
        }
      );

  if (result.error) {
    throw result.error;
  }

  return result.data || [];
}

async function loadWarehouse({
  organizationId,
  warehouseId,
}) {
  if (!warehouseId) {
    throw new Error(
      "warehouse_id required"
    );
  }

  const result =
    await supabaseAdmin
      .from(
        "inventory_warehouses"
      )
      .select(
        "id, organization_id, name, created_at"
      )
      .eq(
        "id",
        warehouseId
      )
      .eq(
        "organization_id",
        organizationId
      )
      .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  if (!result.data) {
    throw new Error(
      "Warehouse does not belong to this organization"
    );
  }

  return result.data;
}

async function loadLocation({
  organizationId,
  warehouseId,
  locationId,
}) {
  if (!locationId) {
    throw new Error(
      "location_id required"
    );
  }

  await loadWarehouse({
    organizationId,
    warehouseId,
  });

  const result =
    await supabaseAdmin
      .from(
        "inventory_locations"
      )
      .select(
        "id, warehouse_id, name, created_at"
      )
      .eq(
        "id",
        locationId
      )
      .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  if (!result.data) {
    throw new Error(
      "Inventory location was not found"
    );
  }

  if (
    result.data
      .warehouse_id !==
    warehouseId
  ) {
    throw new Error(
      "Selected location belongs to a different warehouse"
    );
  }

  return result.data;
}

async function loadItemMovements({
  organizationId,
  entityId,
  itemId,
}) {
  const result =
    await supabaseAdmin
      .from(
        "inventory_movements"
      )
      .select("*")
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "entity_id",
        entityId
      )
      .eq(
        "item_id",
        itemId
      )
      .order(
        "movement_date",
        {
          ascending:
            true,
        }
      )
      .order(
        "created_at",
        {
          ascending:
            true,
        }
      );

  if (result.error) {
    throw result.error;
  }

  return result.data || [];
}

function positionQuantity({
  movements,
  warehouseId,
  locationId,
}) {
  return movements
    .filter(
      movement =>
        sameNullable(
          movement.warehouse_id,
          warehouseId
        ) &&
        sameNullable(
          movement.location_id,
          locationId
        )
    )
    .reduce(
      (
        total,
        movement
      ) =>
        total +
        signedInventoryQuantity(
          movement.type,
          movement.quantity
        ),
      0
    );
}

function weightedUnitCost(
  movements
) {
  const positive =
    movements.filter(
      movement =>
        signedInventoryQuantity(
          movement.type,
          movement.quantity
        ) >
        0
    );

  const quantity =
    positive.reduce(
      (
        total,
        movement
      ) =>
        total +
        numeric(
          movement.quantity
        ),
      0
    );

  const value =
    positive.reduce(
      (
        total,
        movement
      ) =>
        total +
        numeric(
          movement.total_cost
        ),
      0
    );

  if (
    quantity > 0 &&
    value > 0
  ) {
    return value / quantity;
  }

  const explicit =
    positive.find(
      movement =>
        numeric(
          movement.unit_cost
        ) >
        0
    );

  return numeric(
    explicit?.unit_cost
  );
}

async function latestUnitCost({
  organizationId,
  entityId,
  itemId,
}) {
  const result =
    await supabaseAdmin
      .from(
        "inventory_ledger"
      )
      .select(
        "unit_cost"
      )
      .eq(
        "organization_id",
        organizationId
      )
      .eq(
        "entity_id",
        entityId
      )
      .eq(
        "item_id",
        itemId
      )
      .order(
        "created_at",
        {
          ascending:
            false,
        }
      )
      .limit(
        1
      )
      .maybeSingle();

  if (
    result.error &&
    result.error.code !==
      "PGRST116"
  ) {
    throw result.error;
  }

  return numeric(
    result.data
      ?.unit_cost
  );
}

async function resolvePutawaySource({
  organizationId,
  entityId,
  task,
}) {
  if (
    !task.source_document_id
  ) {
    throw new Error(
      "PUTAWAY requires source_document_id"
    );
  }

  const movements =
    await loadItemMovements({
      organizationId,
      entityId,
      itemId:
        task.item_id,
    });

  const sourceId =
    String(
      task.source_document_id
    );

  const originalSourceRows =
    movements.filter(
      movement => {
        const warehouseTaskMovement =
          movement.source_module ===
            "warehouse" &&
          movement.source_document ===
            "warehouse_task";

        if (
          warehouseTaskMovement
        ) {
          return false;
        }

        const matchesSource =
          String(
            movement.source_document_id ||
            ""
          ) === sourceId ||
          String(
            movement.reference_id ||
            ""
          ) === sourceId ||
          String(
            movement.document_id ||
            ""
          ) === sourceId;

        return (
          matchesSource &&
          signedInventoryQuantity(
            movement.type,
            movement.quantity
          ) >
            0
        );
      }
    );

  if (
    originalSourceRows.length ===
    0
  ) {
    throw new Error(
      "PUTAWAY source inventory movement was not found"
    );
  }

  const positions =
    new Map();

  for (
    const movement of
      originalSourceRows
  ) {
    const key =
      [
        movement.warehouse_id ||
          "",
        movement.location_id ||
          "",
      ].join(
        "::"
      );

    positions.set(
      key,
      {
        warehouseId:
          movement.warehouse_id ||
          null,

        locationId:
          movement.location_id ||
          null,
      }
    );
  }

  if (
    positions.size !==
    1
  ) {
    throw new Error(
      "PUTAWAY source inventory spans multiple positions"
    );
  }

  const priorRelocations =
    movements
      .filter(
        movement =>
          movement.source_module ===
            "warehouse" &&
          movement.source_document ===
            "warehouse_task" &&
          normalizeInventoryMovementType(
            movement.type
          ) ===
            "TRANSFER_OUT" &&
          String(
            movement.reference_id ||
            ""
          ) === sourceId &&
          String(
            movement.source_document_id ||
            ""
          ) !==
            String(
              task.id
            )
      )
      .reduce(
        (
          total,
          movement
        ) =>
          total +
          numeric(
            movement.quantity
          ),
        0
      );

  const sourceQuantity =
    originalSourceRows.reduce(
      (
        total,
        movement
      ) =>
        total +
        signedInventoryQuantity(
          movement.type,
          movement.quantity
        ),
      0
    );

  const remaining =
    sourceQuantity -
    priorRelocations;

  if (
    remaining <
    numeric(
      task.quantity
    )
  ) {
    throw new Error(
      "PUTAWAY quantity exceeds remaining source stock"
    );
  }

  let unitCost =
    weightedUnitCost(
      originalSourceRows
    );

  if (
    unitCost <=
    0
  ) {
    unitCost =
      await latestUnitCost({
        organizationId,
        entityId,
        itemId:
          task.item_id,
      });
  }

  return {
    sourcePosition:
      [
        ...positions.values(),
      ][0],

    unitCost,
  };
}

async function resolveTransferInCost({
  organizationId,
  entityId,
  task,
}) {
  if (
    !task.source_document_id
  ) {
    throw new Error(
      "TRANSFER_IN requires source_document_id"
    );
  }

  const movements =
    await loadItemMovements({
      organizationId,
      entityId,
      itemId:
        task.item_id,
    });

  const sourceId =
    String(
      task.source_document_id
    );

  const transferOutRows =
    movements.filter(
      movement =>
        movement.source_module ===
          "warehouse" &&
        movement.source_document ===
          "warehouse_task" &&
        normalizeInventoryMovementType(
          movement.type
        ) ===
          "TRANSFER_OUT" &&
        String(
          movement.reference_id ||
          ""
        ) === sourceId
    );

  const transferredQuantity =
    transferOutRows.reduce(
      (
        total,
        movement
      ) =>
        total +
        numeric(
          movement.quantity
        ),
      0
    );

  if (
    transferredQuantity <
    numeric(
      task.quantity
    )
  ) {
    throw new Error(
      "Complete the matching TRANSFER_OUT before TRANSFER_IN"
    );
  }

  let unitCost =
    weightedUnitCost(
      transferOutRows.map(
        movement => ({
          ...movement,
          type:
            "TRANSFER_IN",
        })
      )
    );

  if (
    unitCost <=
    0
  ) {
    const explicit =
      transferOutRows.find(
        movement =>
          numeric(
            movement.unit_cost
          ) >
          0
      );

    unitCost =
      numeric(
        explicit?.unit_cost
      );
  }

  if (
    unitCost <=
    0
  ) {
    unitCost =
      await latestUnitCost({
        organizationId,
        entityId,
        itemId:
          task.item_id,
      });
  }

  return unitCost;
}

async function ensureMovement({
  existing,
  type,
  organizationId,
  entityId,
  task,
  warehouseId,
  locationId,
  unitCost,
  assignedTo,
  referenceId,
  note,
}) {
  const normalizedType =
    normalizeInventoryMovementType(
      type
    );

  const current =
    existing.find(
      movement =>
        normalizeInventoryMovementType(
          movement.type
        ) ===
        normalizedType
    );

  if (current) {
    if (
      !sameNullable(
        current.warehouse_id,
        warehouseId
      ) ||
      !sameNullable(
        current.location_id,
        locationId
      )
    ) {
      throw new Error(
        `${normalizedType} already exists for a different stock position`
      );
    }

    return current;
  }

  const result =
    await createInventoryMovement({
      organizationId,
      entityId,

      itemId:
        task.item_id,

      warehouseId:
        warehouseId ||
        null,

      locationId:
        locationId ||
        null,

      movementType:
        normalizedType,

      quantity:
        task.quantity,

      unitCost,

      referenceType:
        task.source_document,

      referenceId:
        referenceId ||
        task.source_document_id,

      sourceModule:
        "warehouse",

      sourceDocument:
        "warehouse_task",

      sourceDocumentId:
        task.id,

      notes:
        note,

      createdBy:
        assignedTo,

      postToFinance:
        false,
    });

  if (
    !result?.movement
  ) {
    throw new Error(
      `Unable to create ${normalizedType} inventory movement`
    );
  }

  existing.push(
    result.movement
  );

  return result.movement;
}

export async function completeWarehouseTask({
  organization_id,
  entity_id,
  task_id,
  location_id,
  assigned_to = null,
}) {
  if (!organization_id) {
    throw new Error(
      "organization_id required"
    );
  }

  if (!task_id) {
    throw new Error(
      "task_id required"
    );
  }

  const taskResult =
    await supabaseAdmin
      .from(
        "warehouse_tasks"
      )
      .select("*")
      .eq(
        "id",
        task_id
      )
      .eq(
        "organization_id",
        organization_id
      )
      .single();

  if (taskResult.error) {
    throw taskResult.error;
  }

  const task =
    taskResult.data;

  const taskType =
    normalizeInventoryMovementType(
      task.task_type
    );

  const taskStatus =
    normalizeInventoryMovementType(
      task.status
    );

  const resolvedEntityId =
    entity_id ||
    task.entity_id ||
    null;

  const resolvedLocationId =
    location_id ||
    task.location_id ||
    null;

  if (!resolvedEntityId) {
    throw new Error(
      "entity_id required"
    );
  }

  if (
    entity_id &&
    task.entity_id &&
    entity_id !==
      task.entity_id
  ) {
    throw new Error(
      "Warehouse task belongs to a different legal entity"
    );
  }

  const existing =
    await loadTaskMovements({
      organizationId:
        organization_id,

      taskId:
        task.id,
    });

  if (
    taskStatus ===
    "COMPLETED"
  ) {
    return {
      success:
        true,

      duplicate:
        true,

      task,

      movements:
        existing,

      movement:
        existing[
          existing.length -
          1
        ] ||
        null,
    };
  }

  if (
    [
      "CANCELLED",
      "CANCELED",
      "VOID",
    ].includes(
      taskStatus
    )
  ) {
    throw new Error(
      "Warehouse task is not executable"
    );
  }

  if (
    taskType ===
    "TRANSFER"
  ) {
    throw new Error(
      "Legacy TRANSFER tasks are not executable; use TRANSFER_OUT and TRANSFER_IN"
    );
  }

  const assignedTo =
    assigned_to ||
    task.assigned_to ||
    null;

  if (
    LOCATION_MOVEMENT_TASKS.has(
      taskType
    )
  ) {
    if (!task.item_id) {
      throw new Error(
        "Warehouse movement task requires item_id"
      );
    }

    if (
      numeric(
        task.quantity
      ) <=
      0
    ) {
      throw new Error(
        "Warehouse movement task quantity must be greater than zero"
      );
    }

    if (
      !task.warehouse_id
    ) {
      throw new Error(
        "Warehouse movement task requires warehouse_id"
      );
    }

    if (
      !resolvedLocationId
    ) {
      throw new Error(
        "location_id required for Warehouse movement completion"
      );
    }

    await loadLocation({
      organizationId:
        organization_id,

      warehouseId:
        task.warehouse_id,

      locationId:
        resolvedLocationId,
    });
  }

  if (
    taskType ===
    "PUTAWAY"
  ) {
    const source =
      await resolvePutawaySource({
        organizationId:
          organization_id,

        entityId:
          resolvedEntityId,

        task,
      });

    await ensureMovement({
      existing,

      type:
        "TRANSFER_OUT",

      organizationId:
        organization_id,

      entityId:
        resolvedEntityId,

      task,

      warehouseId:
        source
          .sourcePosition
          .warehouseId,

      locationId:
        source
          .sourcePosition
          .locationId,

      unitCost:
        source.unitCost,

      assignedTo,

      referenceId:
        task.source_document_id,

      note:
        "Warehouse putaway source relocation",
    });

    await ensureMovement({
      existing,

      type:
        "TRANSFER_IN",

      organizationId:
        organization_id,

      entityId:
        resolvedEntityId,

      task,

      warehouseId:
        task.warehouse_id,

      locationId:
        resolvedLocationId,

      unitCost:
        source.unitCost,

      assignedTo,

      referenceId:
        task.source_document_id,

      note:
        "Warehouse putaway destination relocation",
    });
  }

  if (
    taskType ===
    "TRANSFER_OUT"
  ) {
    const movements =
      await loadItemMovements({
        organizationId:
          organization_id,

        entityId:
          resolvedEntityId,

        itemId:
          task.item_id,
      });

    const available =
      positionQuantity({
        movements,

        warehouseId:
          task.warehouse_id,

        locationId:
          resolvedLocationId,
      });

    if (
      available <
      numeric(
        task.quantity
      )
    ) {
      throw new Error(
        "TRANSFER_OUT quantity exceeds stock at the selected source location"
      );
    }

    const unitCost =
      await latestUnitCost({
        organizationId:
          organization_id,

        entityId:
          resolvedEntityId,

        itemId:
          task.item_id,
      });

    await ensureMovement({
      existing,

      type:
        "TRANSFER_OUT",

      organizationId:
        organization_id,

      entityId:
        resolvedEntityId,

      task,

      warehouseId:
        task.warehouse_id,

      locationId:
        resolvedLocationId,

      unitCost,

      assignedTo,

      referenceId:
        task.source_document_id,

      note:
        "Warehouse transfer out",
    });
  }

  if (
    taskType ===
    "TRANSFER_IN"
  ) {
    const unitCost =
      await resolveTransferInCost({
        organizationId:
          organization_id,

        entityId:
          resolvedEntityId,

        task,
      });

    await ensureMovement({
      existing,

      type:
        "TRANSFER_IN",

      organizationId:
        organization_id,

      entityId:
        resolvedEntityId,

      task,

      warehouseId:
        task.warehouse_id,

      locationId:
        resolvedLocationId,

      unitCost,

      assignedTo,

      referenceId:
        task.source_document_id,

      note:
        "Warehouse transfer in",
    });
  }

  const updatePayload = {
    status:
      "COMPLETED",

    assigned_to:
      assignedTo,

    completed_at:
      new Date()
        .toISOString(),

    updated_at:
      new Date()
        .toISOString(),
  };

  if (
    resolvedLocationId
  ) {
    updatePayload.location_id =
      resolvedLocationId;
  }

  const updatedResult =
    await supabaseAdmin
      .from(
        "warehouse_tasks"
      )
      .update(
        updatePayload
      )
      .eq(
        "id",
        task.id
      )
      .eq(
        "organization_id",
        organization_id
      )
      .select()
      .single();

  if (
    updatedResult.error
  ) {
    throw updatedResult.error;
  }

  const assignmentResult =
    await supabaseAdmin
      .from(
        "assignments"
      )
      .update({
        status:
          "COMPLETED",

        completed_at:
          new Date()
            .toISOString(),

        updated_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "source_type",
        "warehouse_task"
      )
      .eq(
        "source_id",
        task.id
      )
      .eq(
        "status",
        "ACTIVE"
      );

  if (
    assignmentResult.error
  ) {
    console.error(
      "WAREHOUSE ASSIGNMENT COMPLETION ERROR",
      assignmentResult.error
    );
  }

  return {
    success:
      true,

    duplicate:
      false,

    task:
      updatedResult.data,

    movements:
      existing,

    movement:
      existing[
        existing.length -
        1
      ] ||
      null,
  };
}
