import { NextResponse } from "next/server";

import {
  createOrder,
} from "@/lib/pos/createOrder";

export async function POST(
  request
) {

  try {

    const body =
      await request.json();

    console.log(
      'CREATE ORDER BODY:',
      body
    )

    const result =
      await createOrder(body);

    console.log(
      'CREATE ORDER RESULT:',
      result
    )

    return NextResponse.json(
      result
    );

  } catch (error) {

    console.error(
      'CREATE ORDER ERROR:',
      error
    )

    console.error(
      error.stack
    )

    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stack: error.stack,
      },
      {
        status: 500,
      }
    );
  }
}
