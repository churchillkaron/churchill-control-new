export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { processDueRecurringJournals } from "@/lib/finance/recurring-journals/RecurringJournalService";

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
    const result = await processDueRecurringJournals();
    return Response.json(result, { status: result.failed > 0 ? 207 : 200 });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Recurring Journal processing failed" },
      { status: 500 }
    );
  }
}
