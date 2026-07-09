import {
  createCreativeProject,
  PROJECT_STATUS,
} from "../documents/CreativeProject";

import * as Repository
from "../repositories/CreativeProjectRepository";

function validateProject(project) {
  if (!project.organization_id) {
    throw new Error("organization_id required");
  }

  if (!project.name?.trim()) {
    throw new Error("Project name required");
  }

  return true;
}

export const CreativeProjectRuntime = {
  async create(input = {}) {
    const project =
      createCreativeProject(input);

    validateProject(project);

    return Repository.create(project);
  },

  async get(id) {
    return Repository.getById(id);
  },

  async list({
    organizationId,
    organization_id,
  } = {}) {
    const resolvedOrganizationId =
      organizationId || organization_id;

    if (!resolvedOrganizationId) {
      throw new Error("organizationId required");
    }

    return Repository.listByOrganization(
      resolvedOrganizationId
    );
  },

  async update(id, values = {}) {
    return Repository.update(id, values);
  },

  async archive(id) {
    return Repository.archive(id);
  },

  async duplicate(id) {
    return Repository.duplicate(id);
  },

  async transition(id, status) {
    if (!PROJECT_STATUS[status]) {
      throw new Error("Invalid project status");
    }

    return Repository.update(id, {
      status,
    });
  },
};
