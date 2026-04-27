import { supabase } from "@/lib/supabase";

export async function GET() {
  const tenant_id = "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/owner`
    );
    const data = await res.json();

    const dishes = [...(data.top || []), ...(data.worst || [])];

    const decisions = dishes.map((d) => {
      let decision = "KEEP";
      let reason = "Stable";

      if (d.margin < 20) {
        decision = "REMOVE";
        reason = "Very low profit";
      } else if (d.margin < 40) {
        decision = "IMPROVE";
        reason = "Low margin";
      } else if (d.margin >= 60 && d.sold > 10) {
        decision = "PUSH";
        reason = "High profit & popular";
      }

      if (d.sold <= 1) {
        decision = "STOP_PRODUCTION";
        reason = "No demand";
      }

      return {
        name: d.name,
        sold: d.sold,
        revenue: d.revenue,
        profit: d.profit,
        margin: d.margin,
        decision,
        reason,
      };
    });

    return Response.json({
      success: true,
      decisions,
    });
  } catch (err) {
    console.error("MENU DECISION ERROR:", err);

    return Response.json(
      { error: err.message },
      { status: 500 }
    );
  }
}