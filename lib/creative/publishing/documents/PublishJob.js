import crypto from "crypto";

export function createPublishJob(data = {}) {

  const now =
    new Date().toISOString();

  return {

    id:
      crypto.randomUUID(),

    organization_id:
      data.organization_id,

    creative_project_id:
      data.creative_project_id ?? null,

    render_job_id:
      data.render_job_id ?? null,

    channel:
      data.channel,

    provider_id:
      data.provider_id,

    status:
      data.status ?? "PENDING",

    payload:
      data.payload ?? {},

    result:
      data.result ?? {},

    created_at:
      now,

    updated_at:
      now,

  };

}
