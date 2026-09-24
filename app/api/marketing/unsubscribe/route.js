export const dynamic = "force-dynamic";

import { MarketingCampaignUnsubscribeRuntime } from "@/lib/marketing/campaigns/MarketingCampaignUnsubscribeRuntime";

function html(body, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  try {
    MarketingCampaignUnsubscribeRuntime.verifyToken(token);
    return html(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head><body style="font-family:system-ui;background:#F7F6F3;color:#2D2822;padding:40px"><main style="max-width:560px;margin:auto;background:white;border:1px solid #e7e0d8;border-radius:20px;padding:28px"><h1 style="font-size:24px">Email preferences</h1><p>Confirm that you want to stop receiving marketing email from this organization.</p><form method="post"><input type="hidden" name="token" value="${token.replace(/[&<>\"]/g, "")}"><button style="border:1px solid #D6A66A;background:#FBF4EA;padding:12px 18px;border-radius:12px;cursor:pointer">Unsubscribe</button></form></main></body></html>`);
  } catch {
    return html("<!doctype html><html><body><p>This unsubscribe link is invalid.</p></body></html>", 400);
  }
}

export async function POST(request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let token = "";
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      token = String(form.get("token") || new URL(request.url).searchParams.get("token") || "");
    } else {
      const body = await request.json().catch(() => ({}));
      token = String(body.token || new URL(request.url).searchParams.get("token") || "");
    }
    await MarketingCampaignUnsubscribeRuntime.unsubscribe(token);
    return html("<!doctype html><html><body style='font-family:system-ui;background:#F7F6F3;color:#2D2822;padding:40px'><main style='max-width:560px;margin:auto;background:white;border:1px solid #e7e0d8;border-radius:20px;padding:28px'><h1 style='font-size:24px'>Unsubscribed</h1><p>You will no longer receive marketing email through this channel.</p></main></body></html>");
  } catch (error) {
    return html(`<!doctype html><html><body><p>${error?.message === "MARKETING_UNSUBSCRIBE_RUNTIME_NOT_READY" ? "Unsubscribe service is temporarily unavailable." : "This unsubscribe request could not be completed."}</p></body></html>`, error?.message === "MARKETING_UNSUBSCRIBE_RUNTIME_NOT_READY" ? 503 : 400);
  }
}
