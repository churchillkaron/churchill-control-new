import * as Repository from "../repositories/SceneRepository";
import { createScene } from "../documents/Scene";
import {
  CreativeProfessionalDirectionAuthorityRuntime,
} from "@/lib/creative/continuity/runtime/CreativeProfessionalDirectionAuthorityRuntime";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function hydrate(scene) {
  if (!scene) return scene;
  const metadata = object(scene.metadata);
  return {
    ...scene,
    coverage_plan: object(scene.coverage_plan || metadata.coverage_plan),
    cinematic_coverage: object(
      scene.cinematic_coverage || metadata.cinematic_coverage,
    ),
    professional_direction: object(metadata.professional_direction),
  };
}

async function normalizedUpdate(id, values = {}) {
  const currentRow = await Repository.get(id);
  if (!currentRow) throw new Error("CREATIVE_SCENE_NOT_FOUND");
  const current = hydrate(currentRow);

  const next = { ...values };
  const professionalEdit = values._professional_direction === true;
  delete next._professional_direction;

  const authority = professionalEdit
    ? CreativeProfessionalDirectionAuthorityRuntime.apply({
        kind: "SCENE",
        current,
        candidate: values,
        revisionReason: values.revision_reason,
      })
    : null;

  const metadata = {
    ...object(current.metadata),
    ...object(values.metadata),
    ...object(authority?.metadata),
  };

  if (Object.prototype.hasOwnProperty.call(values, "coverage_plan")) {
    metadata.coverage_plan = object(values.coverage_plan);
    delete next.coverage_plan;
  }
  if (Object.prototype.hasOwnProperty.call(values, "cinematic_coverage")) {
    metadata.cinematic_coverage = object(values.cinematic_coverage);
    delete next.cinematic_coverage;
  }

  const coveragePlan = object(metadata.coverage_plan);
  const cinematicCoverage = object(metadata.cinematic_coverage);
  metadata.coverage_contract =
    cinematicCoverage.contract || metadata.coverage_contract || null;
  metadata.cinematic_coverage_preserved = Boolean(
    Object.keys(coveragePlan).length,
  );

  next.metadata = metadata;
  const updated = hydrate(await Repository.update(id, next));
  return {
    ...updated,
    professional_direction_change: authority
      ? {
          changed_fields: authority.changed_fields,
          locked_fields: authority.locked_fields,
        }
      : null,
  };
}

export const SceneRuntime = {
  async list(input = {}) {
    const scenes = await Repository.list(input);
    return scenes.map(hydrate);
  },

  async get(id) {
    return hydrate(await Repository.get(id));
  },

  async create(input = {}) {
    return hydrate(await Repository.create(createScene(input)));
  },

  async update(id, values = {}) {
    return normalizedUpdate(id, values);
  },

  async archive(id) {
    return hydrate(await Repository.update(id, {
      archived_at: new Date().toISOString(),
    }));
  },

  async resolve(input = {}, permissions = []) {
    const items = await this.list(input);
    const current = items[0] || null;
    return {
      current,
      items,
      commands: ["create", "update", "archive"],
      status: current?.status || "ready",
      permissions,
    };
  },
};
