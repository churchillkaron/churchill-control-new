import { NextResponse } from "next/server";

import createEntity from "@/lib/finance/entity-management/createEntity";

import createIntercompanyTransaction from "@/lib/finance/intercompany/createIntercompanyTransaction";

import generateConsolidatedFinancials from "@/lib/finance/consolidation/generateConsolidatedFinancials";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await createEntity(
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
      await createIntercompanyTransaction(
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

export async function PATCH() {

  try {

    const result =
      await generateConsolidatedFinancials();

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
