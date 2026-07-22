import {
  createShot,
} from "../documents/Shot";

import * as Repository from "../repositories/ShotRepository";

export const ShotRuntime = {
  async list(input = {}) {
    return Repository.list(input);
  },

  async get(id, input = {}) {
    return Repository.get(id, input);
  },

  async create(input = {}) {
    return Repository.create(
      createShot(input),
    );
  },

  async update(id, values = {}, input = {}) {
    return Repository.update(id, values, input);
  },

  async byScene(input = {}) {
    const shots = await Repository.list(input);

    return shots.reduce((map, shot) => {
      if (!map[shot.scene_id]) {
        map[shot.scene_id] = [];
      }

      map[shot.scene_id].push(shot);
      return map;
    }, {});
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
          input.reason || "Shot archived",
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
