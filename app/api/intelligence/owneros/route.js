import { NextResponse } from "next/server";

import buildOwnerOS from "@/lib/intelligence/owneros/buildOwnerOS";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildOwnerOS(
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
