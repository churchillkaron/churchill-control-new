import { analyzeUBTE } from "@/lib/shared/ubte/intelligence";

/**
 * UBTE INSIGHTS API
 * AI-ready system health endpoint
 */

export async function GET() {
  const insights = analyzeUBTE();

  return Response.json({
    timestamp: Date.now(),
    insights
  });
}
