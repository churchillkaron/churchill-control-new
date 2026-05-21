import { NextResponse } from "next/server";

import getServerUser from "@/lib/auth/server/getServerUser";

export const dynamic =
  "force-dynamic";

export async function GET() {

  try {

    const result =
      await getServerUser();

    return NextResponse.json(
      result
    );

  } catch (error) {

    return NextResponse.json(
      {
        authenticated: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );
  }
}
