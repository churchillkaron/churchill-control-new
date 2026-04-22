import { NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/integrations/googleAuth";

export async function GET(req) {
  try {
    // Get code from Google
    const url = new URL(req.url);
    const code = url.searchParams.get("code");

    if (!code) {
      console.error("No code returned from Google");
      return new NextResponse("Missing code", { status: 400 });
    }

    console.log("CODE:", code);

    // Create OAuth client
    const oauth2Client = getOAuthClient();

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    console.log("TOKENS:", tokens);

    // Redirect to marketing page
    const response = NextResponse.redirect(
      "http://localhost:3000/marketing"
    );

    // Store access token (TEMP SIMPLE VERSION)
    if (tokens?.access_token) {
      response.cookies.set("google_token", tokens.access_token, {
        httpOnly: true,
        path: "/",
      });
    }

    // Optional: store refresh token (if available)
    if (tokens?.refresh_token) {
      response.cookies.set("google_refresh", tokens.refresh_token, {
        httpOnly: true,
        path: "/",
      });
    }

    return response;

  } catch (err) {
    console.error("CALLBACK ERROR:", err);
    return new NextResponse("Error during Google auth", { status: 500 });
  }
}