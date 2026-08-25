export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  claimSecretaryCommitmentExtraction,
  failSecretaryCommitmentExtraction,
  processSecretaryCommitmentExtraction,
} from "@/lib/operator/secretary/SecretaryCommitmentCaptureRuntime";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 6, 16));
    const workerId = `secretary-commitment:${crypto.randomUUID()}`;
    const results = [];

    for (let index = 0; index < limit; index += 1) {
      const extraction = await claimSecretaryCommitmentExtraction({
        workerId,
        leaseSeconds: 180,
      });
      if (!extraction) break;

      try {
        const result = await processSecretaryCommitmentExtraction(extraction);
        results.push({
          extraction_id: extraction.id,
          source_kind: extraction.source_kind,
          status: result.status,
          commitment_count: Number(result.commitment_count || 0),
          follow_up_count: Number(result.follow_up_count || 0),
          task_count: Number(result.task_count || 0),
        });
      } catch (error) {
        const failed = await failSecretaryCommitmentExtraction(extraction, error);
        results.push({
          extraction_id: extraction.id,
          source_kind: extraction.source_kind,
          status: String(failed.status || "FAILED").toLowerCase(),
          error: String(error?.message || error || "Commitment extraction failed").slice(0, 500),
        });
      }
    }

    const failedCount = results.filter((item) => item.status === "failed").length;
    return Response.json(
      {
        success: failedCount === 0,
        contract: "AVANTIQO_SECRETARY_COMMITMENT_CAPTURE_PROCESS_V1",
        processed_count: results.length,
        failed_count: failedCount,
        results,
        external_authority_used: false,
      },
      {
        status: failedCount > 0 ? 207 : 200,
        headers: { "Cache-Control": "no-store, private" },
      },
    );
  } catch (error) {
    console.error("SECRETARY_COMMITMENT_CAPTURE_PROCESS_FAILED", error?.message || error);
    return Response.json(
      {
        success: false,
        error: error?.message || "Secretary commitment capture process failed",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
