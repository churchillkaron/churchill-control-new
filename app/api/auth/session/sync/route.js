export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

import {
  getPublicSupabaseKey,
  getPublicSupabaseUrl,
} from "@/lib/shared/supabase/publicConfig";

function failure(error, status = 401) {
  const response = NextResponse.json({ success: false, error }, { status });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const accessToken = String(body?.access_token || "").trim();
  const refreshToken = String(body?.refresh_token || "").trim();

  if (!accessToken || !refreshToken) {
    return failure("Authenticated session required", 400);
  }
  let response = NextResponse.json({ success: true });
  const supabase = createServerClient(
    getPublicSupabaseUrl(),
    getPublicSupabaseKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers = {}) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
          Object.entries(headers).forEach(([name, value]) => {
            response.headers.set(name, value);
          });
        },
      },
    },
  );

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (sessionError) return failure("Invalid session");
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) return failure("Invalid session");

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
