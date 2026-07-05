import { createCreativeMissionDocument } from "@/lib/creative/missions/documents/CreativeMission";
import { CreativeMissionRepository } from "@/lib/creative/missions/repositories/CreativeMissionRepository";

export const CreativeMissionRuntime = {

  async list(params = {}) {
    return CreativeMissionRepository.list(params);
  },

  async get(id) {
    return CreativeMissionRepository.get(id);
  },

  async create(input = {}) {
    if (!input.organization_id) {
      throw new Error("organization_id required");
    }

    const document = createCreativeMissionDocument(input);
    return CreativeMissionRepository.create(document);
  },

  async update(id, patch = {}) {
    return CreativeMissionRepository.update(id, patch);
  },

  async start(id) {
    return CreativeMissionRepository.update(id, {
      status: "active",
      started_at: new Date().toISOString(),
    });
  },

  async pause(id) {
    return CreativeMissionRepository.update(id, {
      status: "paused",
    });
  },

  async complete(id, learning_summary = null) {
    return CreativeMissionRepository.update(id, {
      status: "completed",
      approval_state: "approved",
      completed_at: new Date().toISOString(),
      learning_summary,
    });
  },

  async archive(id) {
    return CreativeMissionRepository.update(id, {
      status: "archived",
    });
  },

};
