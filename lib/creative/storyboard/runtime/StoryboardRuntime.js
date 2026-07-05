import {
  createStoryboard,
} from "../documents/Storyboard";

import * as Repository
from "../repositories/StoryboardRepository";

export const StoryboardRuntime = {

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

    return Repository.create(

      createStoryboard(input),

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

};
