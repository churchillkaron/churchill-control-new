import {
  createShot,
} from "../documents/Shot";

import * as Repository
from "../repositories/ShotRepository";

export const ShotRuntime = {

  async list(input) {

    return Repository.list(input);

  },

  async get(id) {

    return ShotRepository.get(id);

  },

  async create(input) {

    return Repository.create(
      createShot(input)
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

  async byScene(input) {

    const shots =
      await Repository.list(input);

    return shots.reduce(
      (map, shot) => {

        if (!map[shot.scene_id])
          map[shot.scene_id] = [];

        map[shot.scene_id]
          .push(shot);

        return map;

      },
      {}
    );

  },



  async archive(id) {

    return ShotRepository.update(
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
