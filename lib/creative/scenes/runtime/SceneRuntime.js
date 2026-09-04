import * as Repository from "../repositories/SceneRepository";
import { createScene } from "../documents/Scene";

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
  };
}

async function normalizedUpdate(id, values = {}) {
  const current = await Repository.get(id);
  if (!current) throw new Error("CREATIVE_SCENE_NOT_FOUND");

  const next = { ...values };
  const metadata = {
    ...object(current.metadata),
    ...object(values.metadata),
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
  return hydrate(await Repository.update(id, next));
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