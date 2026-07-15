import {
  createCreativeConcept,
} from "../documents/CreativeConcept";

import {
  CreativeConceptRepository,
} from "../repositories/CreativeConceptRepository";

export const CreativeConceptRuntime = {

  async get(id) {

    return Repository.get(
      id,
    );

  },

  async create(input = {}) {

    return CreativeConceptRepository.create(
      createCreativeConcept(input)
    );

  },

  async list(organization_id) {

    return CreativeConceptRepository.list(
      organization_id
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
