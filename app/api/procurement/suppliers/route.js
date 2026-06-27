import { NextResponse } from "next/server";

import createSupplierPrice from "@/lib/procurement/suppliers/capabilities/createSupplierPrice";

import getBestSupplierPrice from "@/lib/procurement/pricing/capabilities/getBestSupplierPrice";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await createSupplierPrice(
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

export async function PUT(req) {

  try {

    const body =
      await req.json();

    const result =
      await getBestSupplierPrice({

        ingredient_id:
          body.ingredient_id,
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
