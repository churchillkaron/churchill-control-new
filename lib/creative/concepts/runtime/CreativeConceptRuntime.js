import {
  createCreativeConcept,
} from "../documents/CreativeConcept";

import {
  CreativeConceptRepository,
} from "../repositories/CreativeConceptRepository";

export const CreativeConceptRuntime = {

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

};
