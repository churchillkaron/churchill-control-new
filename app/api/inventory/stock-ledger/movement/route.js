import { NextResponse } from "next/server";

import { createInventoryMovement } from "@/lib/inventory/movements/createInventoryMovement";

export async function POST(request) {

  try {

    const body =
      await request.json();

    const result =
      await createInventoryMovement({

        organizationId:
          body.organizationId,

        entityId:
          body.entityId,

        ingredientId:
          body.ingredientId,

        movementType:
          body.movementType,

        quantity:
          body.quantity,

        unitCost:
          body.unitCost,

        referenceType:
          body.referenceType,

        referenceId:
          body.referenceId,

        sourceModule:
          body.sourceModule,

        sourceDocument:
          body.sourceDocument,

        sourceDocumentId:
          body.sourceDocumentId,

        notes:
          body.notes,

        createdBy:
          body.createdBy,

        postToFinance:
          body.postToFinance,

      });

    return NextResponse.json({
      success: true,
      ...result,
    });

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      {
        status: 400,
      }
    );

  }

}
