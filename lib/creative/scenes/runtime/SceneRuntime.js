import * as Repository from "../repositories/SceneRepository";
import { createScene } from "../documents/Scene";

export const SceneRuntime = {
  async list(input = {}) {
    return Repository.list(input);
  },

  async get(id, input = {}) {
    return Repository.get(id, input);
  },

  async create(input = {}) {
    return Repository.create(
      createScene(input),
    );
  },

  async update(id, values = {}, input = {}) {
    return Repository.update(id, values, input);
  },

  async archive(id, input = {}) {
    return Repository.update(
      id,
      {
        organization_id: input.organization_id,
        creative_project_id:
          input.creative_project_id || null,
        archived_at: new Date().toISOString(),
        revision_reason:
          input.reason || "Scene archived",
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
