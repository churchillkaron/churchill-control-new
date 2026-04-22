import { NextResponse } from "next/server";

const BASE_URL = "https://chaste-rut-framing.ngrok-free.dev";

export async function GET() {
  const state = crypto.randomUUID();

  const authUrl = new URL("https://www.facebook.com/v23.0/dialog/oauth");

  authUrl.searchParams.set("client_id", process.env.META_APP_ID);
  authUrl.searchParams.set(
    "redirect_uri",
    `${BASE_URL}/api/meta/auth/callback`
  );
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("response_type", "code");

  // 🔥 REQUIRED FOR PAGES
  authUrl.searchParams.set(
    "scope",
    "pages_show_list,pages_read_engagement"
  );

  const response = NextResponse.redirect(authUrl.toString());

  response.cookies.set("fb_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  });

  return response;
}