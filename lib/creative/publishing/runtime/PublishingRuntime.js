import {
  createPublishJob,
} from "../documents/PublishJob";

import * as Repository
from "../repositories/PublishingRepository";

export const PublishingRuntime = {

  async list(input = {}) {

    return Repository.listByProject(
      input,
    );

  },

  async create(input = {}) {

    return Repository.create(

      createPublishJob(input),

    );

  },

  async update(id, values = {}) {

    return Repository.update(
      id,
      values,
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
