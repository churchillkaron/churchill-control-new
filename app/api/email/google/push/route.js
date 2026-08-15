export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "node:crypto";
import { requestEmailSync } from "@/lib/commercial/communications/CommunicationEmailSubscriptionRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function cryptoSafeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function authorized(request) {
  const expected = text(process.env.GOOGLE_EMAIL_PUBSUB_PUSH_TOKEN);
  if (!expected) return false;
  const url = new URL(request.url);
  const supplied = text(url.searchParams.get("token"));
  return supplied.length > 0 && cryptoSafeEqual(supplied, expected);
}

export async function POST(request) {
  if (!authorized(request)) {
    return new Response(null, { status: 401 });
  }

  try {
    const payload = await request.json();
    const encoded = text(payload?.message?.data);
    if (!encoded) return new Response(null, { status: 204 });
    const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    const mailbox = text(decoded?.emailAddress).toLowerCase();
    if (!mailbox) return new Response(null, { status: 204 });

    await requestEmailSync({
      provider: "email_google",
      mailbox,
    });

    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 204 });
  }
}
