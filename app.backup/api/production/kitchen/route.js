import { NextResponse } from "next/server";

import createKitchenTicket from "@/lib/production/kitchen/createKitchenTicket";

import updateKitchenItemStatus from "@/lib/production/kitchen/updateKitchenItemStatus";

export async function POST(req) {

  try {

    const body =
      await req.json();

    if (
      body.action ===
      "CREATE_TICKET"
    ) {

      const result =
        await createKitchenTicket(
          body
        );

      return NextResponse.json(
        result
      );
    }

    if (
      body.action ===
      "UPDATE_ITEM_STATUS"
    ) {

      const result =
        await updateKitchenItemStatus(
          body
        );

      return NextResponse.json(
        result
      );
    }

    return NextResponse.json(
      {

        success: false,

        error:
          "INVALID_ACTION",
      },
      {

        status: 400,
      }
    );

  } catch (error) {

    return NextResponse.json(
      {

        success: false,

        error:
          error.message,
      },
      {

        status: 500,
      }
    );
  }
}
