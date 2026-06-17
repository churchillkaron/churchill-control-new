import { runUBTEAutoActions } from "@/lib/shared/ubte/autoAction";

/**
 * UBTE AUTO ACTION API
 * Safe system self-healing interface
 */

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") || "SAFE";

  const result = await runUBTEAutoActions({
    mode
  });

  return Response.json({
    timestamp: Date.now(),
    ...result
  });
}
