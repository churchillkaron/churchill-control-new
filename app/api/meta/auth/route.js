import { NextResponse } from "next/server";

const BASE_URL =

  "https://app.churchillkaron.com";

export async function GET() {

  try {

    console.log("META AUTH START");

    const state = crypto.randomUUID();

    const authUrl = new URL(
      "https://www.facebook.com/v23.0/dialog/oauth"
    );

    authUrl.searchParams.set(
      "client_id",
      process.env.META_APP_ID
    );

    authUrl.searchParams.set(
      "redirect_uri",
      `${BASE_URL}/api/meta/auth/callback`
    );

    authUrl.searchParams.set(
      "state",
      state
    );

    authUrl.searchParams.set(
      "response_type",
      "code"
    );

    authUrl.searchParams.set(
      "scope",
     [
  "public_profile",
  "pages_show_list",
].join(",")
    );

    const response =
      NextResponse.redirect(
        authUrl.toString()
      );

    response.cookies.set(
      "fb_oauth_state",
      state,
      {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
      }
    );

    return response;

  } catch (err) {

    return NextResponse.json(
      {
        error:
          err.message ||
          "Meta auth failed",
      },
      { status: 500 }
    );

  }

}