export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

const APPROVAL_ENDPOINT = "/api/creative/tests/gemini-omni-5s/research-approval";
const TEST_CONTRACT = "GEMINI_OMNI_FULL_STUDIO_5S_SMOKE_V1";

function text(value) {
  return String(value ?? "").trim();
}

function json(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

export async function GET(request) {
  try {
    const requestUrl = new URL(request.url);
    const approvalPhrase = text(requestUrl.searchParams.get("approval_phrase"));

    if (!approvalPhrase) {
      return json({
        success: false,
        contract: TEST_CONTRACT,
        error: "CREATIVE_RESEARCH_APPROVAL_PHRASE_REQUIRED",
      }, 400);
    }

    const endpoint = new URL(APPROVAL_ENDPOINT, requestUrl.origin);
    const headers = new Headers({
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: requestUrl.origin,
    });

    const cookie = request.headers.get("cookie");
    const authorization = request.headers.get("authorization");
    if (cookie) headers.set("cookie", cookie);
    if (authorization) headers.set("authorization", authorization);

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ approval_phrase: approvalPhrase }),
      cache: "no-store",
      redirect: "manual",
    });

    const raw = await response.text();
    const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";

    return new NextResponse(raw, {
      status: response.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store, max-age=0",
        Pragma: "no-cache",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  } catch (error) {
    return json({
      success: false,
      contract: TEST_CONTRACT,
      error: error?.message || String(error),
    }, 500);
  }
}
