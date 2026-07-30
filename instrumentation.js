import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    await import(
      "@/lib/creative/director/runtime/CreativeUniversalTemporalCoverageBootstrap"
    );
    await import(
      "@/lib/creative/execution/runtime/CreativeProductionTaskMaterializationGraphRuntime"
    );
    await import(
      "@/lib/creative/production/review/runtime/CreativeProductionTaskReviewSettlementGate"
    );
    await import(
      "@/lib/creative/audio/runtime/CreativeMasterSoundtrackRenderGate"
    );
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
