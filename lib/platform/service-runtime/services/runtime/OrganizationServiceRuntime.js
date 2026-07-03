import {
  resolveOrganizationServices,
} from "../resolvers/OrganizationServiceResolver";

import * as Repository
from "../repositories/OrganizationServiceRepository";

export const OrganizationServiceRuntime = {

  async list(
    organizationId
  ) {
    return resolveOrganizationServices({
      organizationId,
    });
  },

  async save(
    record
  ) {
    return Repository.save(record);
  },

};
