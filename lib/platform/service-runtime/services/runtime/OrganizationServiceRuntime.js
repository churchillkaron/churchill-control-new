import {
  resolveOrganizationServices,
  resolveOrganizationService,
  resolveOrganizationProvider,
} from "../resolver/OrganizationServiceResolver";

import * as Repository
from "../repositories/OrganizationServiceRepository";

export const OrganizationServiceRuntime = {

  async list(
    organization_id
  ) {
    return resolveOrganizationServices({
      organization_id,
    });
  },

  async get({
    organization_id,
    category_id,
    service_id,
  }) {
    return resolveOrganizationService({
      organization_id,
      category_id,
      service_id,
    });
  },

  async provider({
    organization_id,
    category_id,
    service_id,
    provider_id,
  }) {
    return resolveOrganizationProvider({
      organization_id,
      category_id,
      service_id,
      provider_id,
    });
  },

  async save(
    record
  ) {
    return Repository.save(record);
  },

};
