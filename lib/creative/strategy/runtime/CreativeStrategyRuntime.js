import {
  createCreativeStrategy,
} from "../documents/CreativeStrategy";

import * as Repository
from "../repositories/CreativeStrategyRepository";

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

    return Repository.create(

      createCreativeStrategy(input),

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
