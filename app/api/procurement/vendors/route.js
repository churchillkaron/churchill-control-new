import { NextResponse } from "next/server";

import createVendor from "@/lib/procurement/suppliers/documents/createVendor";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await createVendor(
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
