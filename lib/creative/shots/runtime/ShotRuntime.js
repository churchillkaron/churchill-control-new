import {
  createShot,
} from "../documents/Shot";

import * as Repository
from "../repositories/ShotRepository";

export const ShotRuntime = {

  async list(input) {

    return Repository.list(input);

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

};
