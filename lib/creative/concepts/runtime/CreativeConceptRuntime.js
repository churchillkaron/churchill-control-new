import {
  createCreativeConcept,
} from "../documents/CreativeConcept";

import {
  CreativeConceptRepository as Repository,
} from "../repositories/CreativeConceptRepository";
import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";

function organizationId(input = {}) {
  if (typeof input === "string") return input;
  return input.organization_id || input.organizationId || null;
}

async function withOptionalCampaignContext(input = {}) {
  if (input.campaign_id || !input.creative_project_id) return input;

  const project = await CreativeProjectRepository.getById(input.creative_project_id);
  if (!project || String(project.organization_id) !== String(input.organization_id)) {
    return input;
  }

  return {
    ...input,
    campaign_id: project.campaign_id || null,
  };
}

export const CreativeConceptRuntime = {
  async get(id) {
    return Repository.get(id);
  },

  async create(input = {}) {
    const resolved = await withOptionalCampaignContext(input);
    return Repository.create(createCreativeConcept(resolved));
  },

  async list(input = {}) {
    const resolvedOrganizationId = organizationId(input);
    if (!resolvedOrganizationId) throw new Error("organization_id required");
    return Repository.list({
      organization_id: resolvedOrganizationId,
      creative_mission_id:
        typeof input === "object" ? input.creative_mission_id || null : null,
      creative_project_id:
        typeof input === "object" ? input.creative_project_id || null : null,
    });
  },

  async update(id, values = {}) {
    return Repository.update(id, values);
  },

  async archive(id) {
    return Repository.update(id, {
      archived_at: new Date().toISOString(),
    });
  },

  async resolve(input = {}, permissions = []) {
    const items = await this.list(input);
    const current = items[0] || null;
    return {
      current,
      items,
      commands: ["create", "update", "archive"],
      status: current?.status || "ready",
      permissions,
    };
  },
};
