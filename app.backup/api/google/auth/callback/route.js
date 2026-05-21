export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getOAuthClient }
from "@/lib/integrations/googleAuth";

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000";

export async function GET(request) {

  try {

    const url =
      new URL(request.url);

    const code =
      url.searchParams.get("code");

    if (!code) {

      return NextResponse.redirect(
        `${BASE_URL}/marketing?error=no_code`
      );
    }

    const oauth2Client =
      getOAuthClient();

    const {
      tokens,
    } =
      await oauth2Client.getToken(
        code
      );

    const response =
      NextResponse.redirect(
        `${BASE_URL}/marketing`
      );

    response.cookies.set(
      "google_token",
      JSON.stringify(tokens),
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
      }
    );

    return response;

  } catch (error) {

    console.error(error);

    return NextResponse.redirect(
      `${BASE_URL}/marketing?error=oauth_failed`
    );
  }
}
