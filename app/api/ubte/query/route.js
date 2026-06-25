import { NextResponse } from "next/server";

import * as OrderQuery from "@/lib/restaurant/queries/orders/GetOrder";
import * as KitchenQuery from "@/lib/restaurant/queries/kitchen/GetKitchenTicket";
import * as PaymentQuery from "@/lib/restaurant/queries/payments/GetPayment";
import * as SessionQuery from "@/lib/restaurant/queries/sessions/GetSession";

const registry = {

  restaurant: {

    order:
      OrderQuery.execute,

    kitchen:
      KitchenQuery.execute,

    payment:
      PaymentQuery.execute,

    session:
      SessionQuery.execute,

  },

};

export async function POST(req) {

  const body =
    await req.json();

  const fn =
    registry?.[
      body.domain
    ]?.[
      body.query
    ];

  if (!fn) {

    return NextResponse.json(
      {
        success:false,
        error:"Unknown query",
      },
      {
        status:404,
      }
    );

  }

  const result =
    await fn(body);

  return NextResponse.json({
    success:true,
    result,
  });

}
