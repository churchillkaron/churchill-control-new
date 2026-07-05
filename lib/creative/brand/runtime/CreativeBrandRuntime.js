import {
  createCreativeBrand,
} from "../documents/CreativeBrand";

import * as Repository
from "../repositories/CreativeBrandRepository";

export const CreativeBrandRuntime = {

  async create(input = {}) {

    const brand =
      createCreativeBrand(input);

    return Repository.create(
      brand,
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

  async list(
    input = {},
  ) {

    return Repository.list(
      input,
    );

  },

};
