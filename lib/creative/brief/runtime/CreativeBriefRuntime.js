import {
  createCreativeBrief,
} from "../documents/CreativeBrief";

import * as Repository
from "../repositories/CreativeBriefRepository";

export const CreativeBriefRuntime = {

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

      createCreativeBrief(
        input,
      ),

    );

  },

  async update(
    id,
    values = {},
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

};
