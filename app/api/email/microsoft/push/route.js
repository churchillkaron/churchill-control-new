export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { requestEmailSync } from "@/lib/commercial/communications/CommunicationEmailSubscriptionRuntime";

function text(value) {
  return String(value ?? "").trim();
}

export async function POST(request) {
  const url = new URL(request.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken != null) {
    return new Response(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  try {
    const payload = await request.json();
    const notifications = Array.isArray(payload?.value) ? payload.value : [];
    for (const notification of notifications.slice(0, 100)) {
      const subscriptionId = text(notification?.subscriptionId);
      const clientState = text(notification?.clientState);
      if (!subscriptionId || !clientState) continue;
      await requestEmailSync({
        provider: "email_microsoft",
        subscriptionId,
        clientState,
      });
    }
    return new Response(null, { status: 202 });
  } catch {
    return new Response(null, { status: 202 });
  }
}
