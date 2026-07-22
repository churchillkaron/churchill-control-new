import {
  createCreativeConcept,
} from "../documents/CreativeConcept";

import {
  CreativeConceptRepository,
} from "../repositories/CreativeConceptRepository";

export const CreativeConceptRuntime = {
  async get(id, input = {}) {
    return CreativeConceptRepository.get({
      id,
      organization_id: input.organization_id,
      creative_project_id: input.creative_project_id || null,
    });
  },

  async create(input = {}) {
    return CreativeConceptRepository.create(
      createCreativeConcept(input),
    );
  },

  async list(input = {}) {
    return CreativeConceptRepository.list(input);
  },

  async update(id, values = {}, input = {}) {
    return CreativeConceptRepository.update({
      id,
      organization_id:
        input.organization_id || values.organization_id,
      creative_project_id:
        input.creative_project_id ||
        values.creative_project_id ||
        null,
      values,
    });
  },

  async archive(id, input = {}) {
    return this.update(
      id,
      {
        archived_at: new Date().toISOString(),
        revision_reason: "Archive creative concept",
      },
      input,
    );
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
