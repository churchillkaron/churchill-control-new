export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { processLoyaltySystemEvents } from "@/lib/commercial/customers/LoyaltyEventWorker";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const result = await processLoyaltySystemEvents({
      batchSize: searchParams.get("limit") || undefined,
    });

    return Response.json(result, { status: result.success ? 200 : 207 });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || "Loyalty event processing failed",
      },
      { status: 500 }
    );
  }
}
