import {
  createRenderContract,
} from "../contracts/RenderContract";

import {
  selectProvider,
} from "../policies/ProviderPolicy";

import * as Repository
from "../repositories/RenderingRepository";

export const RenderingRuntime = {

  async list(input = {}) {
    return Repository.listByProject(input);
  },

  async create(job = {}) {
    return Repository.create(job);
  },

  async update(id, values = {}) {
    return Repository.update(id, values);
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
        "render",
      ],

      status:
        current?.status ||
        "ready",

      permissions,

    };

  },

  async render(
    production,
    deliverable,
    assets,
  ) {

    const contract =
      createRenderContract(
        production,
        deliverable,
        assets,
      );

    const provider =
      await selectProvider(
        contract,
      );

    return provider.render(
      contract,
    );

  },

};
