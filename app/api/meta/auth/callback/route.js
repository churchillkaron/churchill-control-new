import { NextResponse } from "next/server";

const BASE_URL = "https://chaste-rut-framing.ngrok-free.dev";

export async function GET(request) {
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const savedState = request.cookies.get("fb_oauth_state")?.value;

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(`${BASE_URL}/marketing?facebook=error`);
  }

  const tokenUrl = new URL(
    "https://graph.facebook.com/v23.0/oauth/access_token"
  );

  tokenUrl.searchParams.set("client_id", process.env.META_APP_ID);
  tokenUrl.searchParams.set("client_secret", process.env.META_APP_SECRET);
  tokenUrl.searchParams.set(
    "redirect_uri",
    `${BASE_URL}/api/meta/auth/callback`
  );
  tokenUrl.searchParams.set("code", code);

  const tokenRes = await fetch(tokenUrl.toString());
  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return NextResponse.redirect(`${BASE_URL}/marketing?facebook=error`);
  }

  const response = NextResponse.redirect(
    `${BASE_URL}/marketing?facebook=connected`
  );

  // ✅ CRITICAL COOKIE CONFIG
  response.cookies.set("fb_token", tokenData.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  });

  response.cookies.delete("fb_oauth_state");

  return response;
}