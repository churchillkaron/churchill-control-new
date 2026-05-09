import { NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/integrations/googleAuth";

export const dynamic = "force-dynamic";

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000";

export async function GET(req) {

  try {

    // Get code from Google

    const url = new URL(req.url);

    const code =
      url.searchParams.get("code");

    if (!code) {

      console.error(
        "No code returned from Google"
      );

      return new NextResponse(
        "Missing code",
        { status: 400 }
      );

    }

    console.log("CODE:", code);

    // Create OAuth client

    const oauth2Client =
      getOAuthClient();

    // Exchange code for tokens

    const { tokens } =
      await oauth2Client.getToken(code);

    console.log("TOKENS:", tokens);

    // Redirect to marketing page

    const response =
      NextResponse.redirect(
        `${BASE_URL}/marketing`
      );

    // Store access token

    if (tokens?.access_token) {

      response.cookies.set(
        "google_token",
        tokens.access_token,
        {
          httpOnly: true,
          path: "/",
        }
      );

    }

    // Store refresh token

    if (tokens?.refresh_token) {

      response.cookies.set(
        "google_refresh",
        tokens.refresh_token,
        {
          httpOnly: true,
          path: "/",
        }
      );

    }

    return response;

  } catch (err) {

    console.error(
      "CALLBACK ERROR:",
      err
    );

    return new NextResponse(
      "Error during Google auth",
      { status: 500 }
    );

  }

}