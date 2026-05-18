import { NextResponse } from "next/server";

import getKitchenOrders from "@/lib/pos/kitchen/getKitchenOrders";

import updateKitchenOrderStatus from "@/lib/pos/kitchen/updateKitchenOrderStatus";

export async function GET(req) {

  try {

    const tenant_id =
      req.nextUrl.searchParams.get(
        "tenant_id"
      );

    const result =
      await getKitchenOrders({

        tenant_id,
      });

    return NextResponse.json(
      result
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

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await updateKitchenOrderStatus(
        body
      );

    return NextResponse.json(
      result
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
