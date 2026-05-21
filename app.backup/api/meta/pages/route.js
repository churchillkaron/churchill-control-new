export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET(request) {
  const token = request.cookies.get("fb_token")?.value;

  if (!token) {
    return NextResponse.json({
      success: false,
      error: "Missing Facebook user token",
    });
  }

  const url = new URL("https://graph.facebook.com/v23.0/me/accounts");

  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json({
      success: false,
      error: data?.error?.message || "Failed to fetch pages",
    });
  }

  return NextResponse.json({
    success: true,
    data: data.data || [],
  });
}