function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

export async function publishBusinessPartnerProgress(options = {}, event = {}) {
  const organizationId = text(options.organizationId, 160);
  const actorId = text(options?.actor?.id || options?.actor?.user_id, 160);
  const executionId = text(
    options?.liveExecutionId ||
    options?.callerRequest?.headers?.get?.("x-avantiqo-live-execution-id"),
    200,
  );
  if (!organizationId || !actorId || !executionId) return false;

  try {
    const runtime = await import("@/lib/platform/runtime/AvantiqoLiveExecutionRuntime");
    await runtime.publishAvantiqoLiveExecution({
      context: { organizationId, actor: { id: actorId } },
      executionId,
      event: { lane: "business_action", status: "running", ...event },
    });
    return true;
  } catch {
    return false;
  }
}

export default publishBusinessPartnerProgress;
