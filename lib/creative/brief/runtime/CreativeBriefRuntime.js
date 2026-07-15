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


  async resolve(
    input = {},
    permissions = [],
  ) {

    console.log(
      "CREATIVE BRIEF RESOLVE INPUT",
      input
    );

    const items =
      await this.list(input);

    console.log(
      "CREATIVE BRIEF RESOLVE ITEMS",
      items
    );

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
