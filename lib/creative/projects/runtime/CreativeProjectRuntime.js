import { CreativeProjectsRuntime } from "./CreativeProjectsRuntime";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

export const CreativeProjectRuntime = {

  async list(organizationId) {
    return CreativeProjectsRuntime.list(organizationId);
  },

  async get(id) {
    return CreativeProjectsRuntime.get(id);
  },

  async create(input) {
    return CreativeProjectsRuntime.create(input);
  },

  async update(id, values) {
    return CreativeProjectsRuntime.update(id, values);
  },

  async open({ organizationId, projectId = null } = {}) {

    const projects =
      await CreativeProjectsRuntime.list(organizationId);

    const project =
      projectId
        ? projects.find(p => p.id === projectId)
        : projects[0] || null;

    const assets =
      project
        ? await CreativeAssetsRuntime.list(organizationId)
        : [];

    return {
      project,
      projects,
      assets,
    };

  }

};
