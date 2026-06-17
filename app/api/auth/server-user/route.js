import { NextResponse } from "next/server";

import {
  getServerCurrentUser,
} from "@/lib/auth/getServerCurrentUser";

export const dynamic =
  "force-dynamic";

export async function GET() {

  try {

    const user =
      await getServerCurrentUser();

    return NextResponse.json({
      authenticated: !!user,
      user,
    });

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
