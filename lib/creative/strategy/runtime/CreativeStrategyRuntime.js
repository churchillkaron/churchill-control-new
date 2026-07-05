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

};
