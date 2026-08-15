export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { maintainEmailSubscriptions } from "@/lib/commercial/communications/CommunicationEmailSubscriptionRuntime";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await maintainEmailSubscriptions({ limit: 10 });
    return Response.json(result, { status: result.success ? 200 : 207 });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || "Email push maintenance failed",
      },
      { status: 500 },
    );
  }
}
