import { NextResponse } from "next/server";

const BASE_URL =
  "https://app.churchillkaron.com";

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
// GET USER PAGES

const pagesRes = await fetch(
  `https://graph.facebook.com/v23.0/me/accounts?access_token=${tokenData.access_token}`
);

const pagesData = await pagesRes.json();

console.log("PAGES:", pagesData);

const firstPage = pagesData?.data?.[0];

if (!firstPage) {

  return NextResponse.redirect(
    `${BASE_URL}/marketing?facebook=no_pages`
  );

}

// GET INSTAGRAM BUSINESS ACCOUNT

const igRes = await fetch(
  `https://graph.facebook.com/v23.0/${firstPage.id}?fields=instagram_business_account&access_token=${firstPage.access_token}`
);

const igData = await igRes.json();

console.log("IG DATA:", igData);

const instagramId =
  igData?.instagram_business_account?.id || null;
  const response = NextResponse.redirect(
    `${BASE_URL}/marketing?facebook=connected`
  );
  // SAVE META ACCOUNT

await fetch(
  `${BASE_URL}/api/meta/save-account`,
  {
    method: "POST",

    headers: {
      "Content-Type":
        "application/json",
    },

    body: JSON.stringify({

  connected: true,

  access_token:
    firstPage.access_token,

  page_name:
    firstPage.name,

  page_id:
    firstPage.id,

  instagram_business_id:
    instagramId,

}),
  }
);

  // ✅ CRITICAL COOKIE CONFIG
  response.cookies.set(
  "fb_page_token",
  firstPage.access_token,
  {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  });

  response.cookies.delete("fb_oauth_state");

  return response;
}