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

};
