import "@/lib/creative/video/runtime/CreativeVideoProductionDispatchBootstrap";

import { createShot } from "../documents/Shot";
import * as Repository from "../repositories/ShotRepository";
import {
  CreativeProfessionalDirectionAuthorityRuntime,
} from "@/lib/creative/continuity/runtime/CreativeProfessionalDirectionAuthorityRuntime";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function hydrate(shot) {
  if (!shot) return shot;
  const metadata = object(shot.metadata);
  return {
    ...shot,
    coverage: object(shot.coverage || metadata.coverage),
    scene_coverage_plan: object(
      shot.scene_coverage_plan || metadata.scene_coverage_plan,
    ),
    cinematic_coverage: object(
      shot.cinematic_coverage || metadata.cinematic_coverage,
    ),
    professional_direction: object(metadata.professional_direction),
  };
}

async function normalizedUpdate(id, values = {}) {
  const currentRow = await Repository.get(id);
  if (!currentRow) throw new Error("CREATIVE_SHOT_NOT_FOUND");
  const current = hydrate(currentRow);

  const next = { ...values };
  const professionalEdit = values._professional_direction === true;
  delete next._professional_direction;

  const authority = professionalEdit
    ? CreativeProfessionalDirectionAuthorityRuntime.apply({
        kind: "SHOT",
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

  if (Object.prototype.hasOwnProperty.call(values, "coverage")) {
    metadata.coverage = object(values.coverage);
    delete next.coverage;
  }
  if (Object.prototype.hasOwnProperty.call(values, "scene_coverage_plan")) {
    metadata.scene_coverage_plan = object(values.scene_coverage_plan);
    delete next.scene_coverage_plan;
  }
  if (Object.prototype.hasOwnProperty.call(values, "cinematic_coverage")) {
    metadata.cinematic_coverage = object(values.cinematic_coverage);
    delete next.cinematic_coverage;
  }

  const coverage = object(metadata.coverage);
  const cinematicCoverage = object(metadata.cinematic_coverage);
  metadata.coverage_contract =
    cinematicCoverage.contract || metadata.coverage_contract || null;
  metadata.cinematic_coverage_preserved = Boolean(Object.keys(coverage).length);

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

export const ShotRuntime = {
  async list(input = {}) {
    const shots = await Repository.list(input);
    return shots.map(hydrate);
  },

  async get(id) {
    return hydrate(await Repository.get(id));
  },

  async create(input = {}) {
    return hydrate(await Repository.create(createShot(input)));
  },

  async update(id, values = {}) {
    return normalizedUpdate(id, values);
  },

  async byScene(input = {}) {
    const shots = await this.list(input);
    return shots.reduce((map, shot) => {
      if (!map[shot.scene_id]) map[shot.scene_id] = [];
      map[shot.scene_id].push(shot);
      return map;
    }, {});
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
