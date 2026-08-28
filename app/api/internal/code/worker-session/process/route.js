import {
  reapExpiredCodeAIWorkerSession,
} from "@/lib/code/runtime/CodeAIWorkerSessionRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const result = await reapExpiredCodeAIWorkerSession();
    return Response.json(
      {
        success: true,
        contract: "AVANTIQO_CODE_AI_WORKER_SESSION_REAPER_V1",
        ...result,
        provider_model_call_performed: false,
        wallet_mutation_performed: false,
        production_deploy_performed: false,
        secrets_printed: false,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        contract: "AVANTIQO_CODE_AI_WORKER_SESSION_REAPER_V1",
        error: error?.message || "Code worker session cleanup failed",
        cleanup_failure_hidden: false,
        provider_model_call_performed: false,
        wallet_mutation_performed: false,
        production_deploy_performed: false,
        secrets_printed: false,
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
