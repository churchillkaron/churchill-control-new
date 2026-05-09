import { NextResponse } from "next/server";

const BASE_URL =
  "https://app.churchillkaron.com";

export async function GET(request) {

  const url = new URL(request.url);

  const code =
    url.searchParams.get("code");

  const state =
    url.searchParams.get("state");

  const savedState =
    request.cookies.get(
      "fb_oauth_state"
    )?.value;

  if (
    !code ||
    !state ||
    state !== savedState
  ) {

    return NextResponse.redirect(
      `${BASE_URL}/marketing?facebook=error`
    );

  }

  const tokenUrl = new URL(
    "https://graph.facebook.com/v23.0/oauth/access_token"
  );

  tokenUrl.searchParams.set(
    "client_id",
    process.env.META_APP_ID
  );

  tokenUrl.searchParams.set(
    "client_secret",
    process.env.META_APP_SECRET
  );

  tokenUrl.searchParams.set(
    "redirect_uri",
    `${BASE_URL}/api/meta/auth/callback`
  );

  tokenUrl.searchParams.set(
    "code",
    code
  );

  const tokenRes =
    await fetch(
      tokenUrl.toString()
    );

  const tokenData =
    await tokenRes.json();

  console.log(
    "TOKEN DATA:",
    JSON.stringify(
      tokenData,
      null,
      2
    )
  );

  if (!tokenData.access_token) {

    return Response.json({
      success: false,
      tokenData,
      message:
        "No access token",
    });

  }

  // GET USER PAGES

  const pagesRes =
    await fetch(
      `https://graph.facebook.com/v23.0/me/accounts?access_token=${tokenData.access_token}`
    );

  const pagesData =
    await pagesRes.json();

  console.log(
    "PAGES DATA:",
    JSON.stringify(
      pagesData,
      null,
      2
    )
  );

  // SAFE GUARD

  if (
    !pagesData?.data?.length
  ) {

    return Response.json({
      success: false,
      pagesData,
      message:
        "No Facebook pages found",
    });

  }

  // SAVE ALL PAGES

  for (
    const page of pagesData.data
  ) {

    const igRes =
      await fetch(
        `https://graph.facebook.com/v23.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
      );

    const igData =
      await igRes.json();

    console.log(
      "IG DATA:",
      JSON.stringify(
        igData,
        null,
        2
      )
    );

    const instagramId =
      igData
        ?.instagram_business_account
        ?.id || null;

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
            page.access_token,

          page_name:
            page.name,

          page_id:
            page.id,

          instagram_business_id:
            instagramId,
        }),
      }
    );

  }

  const response =
    NextResponse.redirect(
      `${BASE_URL}/marketing?facebook=connected`
    );

  // USE FIRST PAGE TOKEN
  // FOR SESSION COOKIE

  response.cookies.set(
    "fb_page_token",
    pagesData.data[0]
      .access_token,
    {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
    }
  );

  response.cookies.delete(
    "fb_oauth_state"
  );

  return response;

}