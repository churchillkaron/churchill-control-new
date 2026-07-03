import {
  getIntegrationRegistry,
} from "../registry/IntegrationRegistry";

import {
  createIntegrationConnection,
} from "../documents/IntegrationConnection";

import {
  IntegrationConnectionRepository,
} from "../repositories/IntegrationConnectionRepository";

export const IntegrationConnectionRuntime = {
  catalog() {
    return getIntegrationRegistry();
  },

  async list(organization_id) {
    return IntegrationConnectionRepository.list(
      organization_id
    );
  },

  async save(input) {
    const connection =
      createIntegrationConnection(input);

    return IntegrationConnectionRepository.save(
      connection
    );
  },
};
