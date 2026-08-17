import {
  createCreativeStrategy,
} from "../documents/CreativeStrategy";

import * as Repository
from "../repositories/CreativeStrategyRepository";
import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";

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

export const CreativeStrategyRuntime = {

  async list(input = {}) {

    return Repository.list(
      input,
    );

  },

  async get(id) {

    return Repository.get(
      id,
    );

  },

  async create(input = {}) {
    const resolved = await withOptionalCampaignContext(input);

    return Repository.create(

      createCreativeStrategy(resolved),

    );

  },

  async update(
    id,
    values,
  ) {

    return Repository.update(
      id,
      values,
    );

  },

  async archive(id) {

    return Repository.update(
      id,
      {
        archived_at:
          new Date().toISOString(),
      },
    );

  },

  async resolve(
    input = {},
    permissions = [],
  ) {

    const items =
      await this.list(input);

    const current =
      items[0] || null;

    return {

      current,

      items,

      commands: [
        "create",
        "update",
        "archive",
      ],

      status:
        current?.status ||
        "ready",

      permissions,

    };

  },

};
