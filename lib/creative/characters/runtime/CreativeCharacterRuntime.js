import {
  createCreativeCharacter,
} from "../documents/CreativeCharacter";

import * as Repository from "../repositories/CreativeCharacterRepository";

export const CreativeCharacterRuntime = {

  async create(input = {}) {

    const character =
      createCreativeCharacter(input);

    return Repository.create(character);

  },

  async update(id, values) {

    return Repository.update(
      id,
      values,
    );

  },

  async list(input = {}) {

    return Repository.list(input);

  },

};
