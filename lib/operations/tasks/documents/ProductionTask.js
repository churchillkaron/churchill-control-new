export const PRODUCTION_TASK_STATUS = {
  PLANNED: "PLANNED",
  WAITING: "WAITING",
  READY: "READY",
  RUNNING: "RUNNING",
  REVIEW: "REVIEW",
  APPROVED: "APPROVED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
};

export const PRODUCTION_TASK_TYPES = {
  GENERATE_IMAGE: "GENERATE_IMAGE",
  GENERATE_VIDEO: "GENERATE_VIDEO",
  IMAGE_TO_VIDEO: "IMAGE_TO_VIDEO",
  GENERATE_VOICE: "GENERATE_VOICE",
  GENERATE_MUSIC: "GENERATE_MUSIC",
  GENERATE_SFX: "GENERATE_SFX",
  LIP_SYNC: "LIP_SYNC",
  UPSCALE: "UPSCALE",
  SUBTITLE: "SUBTITLE",
  QUALITY_REVIEW: "QUALITY_REVIEW",
  COMPOSE_SCENE: "COMPOSE_SCENE",
  RENDER_DRAFT: "RENDER_DRAFT",
  RENDER_PRODUCTION: "RENDER_PRODUCTION",
  PUBLISH: "PUBLISH",
};

export function createProductionTask(data = {}) {
  const now = new Date().toISOString();

  return {
    id: data.id ?? crypto.randomUUID(),
    organization_id: data.organization_id,
    creative_project_id:
      data.creative_project_id ?? null,
    production_graph_id:
      data.production_graph_id ?? null,
    scene_id: data.scene_id ?? null,
    shot_id: data.shot_id ?? null,
    type:
      data.type ?? PRODUCTION_TASK_TYPES.GENERATE_IMAGE,
    status:
      data.status ?? PRODUCTION_TASK_STATUS.PLANNED,
    title: data.title ?? "",
    description: data.description ?? "",
    service_id: data.service_id ?? null,
    provider_id: data.provider_id ?? null,
    service_code:
      data.service_code ?? data.service_id ?? null,
    capability: data.capability ?? null,
    priority: Number(data.priority ?? 100),
    depends_on: data.depends_on ?? [],
    input: data.input ?? {},
    output: data.output ?? {},
    cost: {
      currency: data.cost?.currency ?? "USD",
      estimated: Number(data.cost?.estimated ?? 0),
      actual: Number(data.cost?.actual ?? 0),
      approved: data.cost?.approved ?? false,
    },
    timing: {
      estimated_seconds:
        Number(data.timing?.estimated_seconds ?? 0),
      started_at: data.timing?.started_at ?? null,
      completed_at: data.timing?.completed_at ?? null,
    },
    review: {
      required: data.review?.required ?? true,
      approved: data.review?.approved ?? false,
      approved_by: data.review?.approved_by ?? null,
      notes: data.review?.notes ?? "",
    },
    error: data.error ?? null,
    metadata: {
      idempotency_key:
        data.metadata?.idempotency_key ?? data.id ?? null,
      attempt: Number(data.metadata?.attempt ?? 0),
      max_attempts: Number(data.metadata?.max_attempts ?? 3),
      provider_job_id:
        data.metadata?.provider_job_id ?? null,
      provider_status:
        data.metadata?.provider_status ?? null,
      source_node_id:
        data.metadata?.source_node_id ?? null,
      deliverable:
        data.metadata?.deliverable ?? null,
      ...data.metadata,
    },
    created_by: data.created_by ?? null,
    created_at: data.created_at ?? now,
    updated_at: now,
  };
}
