import { NextResponse } from "next/server";

import getTables from "@/lib/pos/tables/getTables";

import updateTableStatus from "@/lib/pos/tables/updateTableStatus";

export async function GET(req) {

  try {

    const tenant_id =
      req.nextUrl.searchParams.get(
        "tenant_id"
      );

    const result =
      await getTables({

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
      await updateTableStatus(
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
