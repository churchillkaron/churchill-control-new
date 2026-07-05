import { NextResponse } from "next/server";

import { createInventoryMovement } from "@/lib/inventory/movements/createInventoryMovement";

export async function POST(req) {
  try {

    const {
      organizationId,
      entityId = null,
      items,
      referenceId = null,
      sourceDocument = "inventory_engine",
    } = await req.json();

    if (!organizationId) {
      throw new Error("organizationId required");
    }

    if (!Array.isArray(items)) {
      throw new Error("Invalid items payload");
    }

    const results = [];

    for (const item of items) {

      const movement =
        await createInventoryMovement({

          organizationId,

          entityId,

          ingredientId:
            item.ingredient_id,

          movementType:
            "CONSUMPTION",

          quantity:
            Number(item.quantity || 0),

          unitCost:
            Number(item.unit_cost || 0),

          referenceType:
            "ORDER",

          referenceId:
            referenceId || item.reference_id,

          sourceModule:
            "inventory",

          sourceDocument,

          sourceDocumentId:
            referenceId || item.reference_id,

          notes:
            item.notes || null,

          createdBy:
            item.created_by || "SYSTEM",

          postToFinance:
            Boolean(entityId),

        });

      results.push(movement);

    }

    return NextResponse.json({
      success: true,
      movements: results,
    });

  } catch (err) {

    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      {
        status: 500,
      }
    );

  }
}
