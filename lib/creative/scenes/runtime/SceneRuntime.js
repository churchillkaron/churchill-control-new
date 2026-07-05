import * as Repository from "../repositories/SceneRepository";
import { createScene } from "../documents/Scene";

export const SceneRuntime = {

  async list(input) {
    return Repository.list(input);
  },

  async create(input) {

    return Repository.create(
      createScene(input)
    );

  },

  async update(id, values) {

    return Repository.update(
      id,
      values
    );

  },

};
