import {
  CreativeMeasuredUniversalTemporalDirectionRuntime,
} from "./CreativeMeasuredUniversalTemporalDirectionRuntime";
import {
  CreativeIdentityAtlasRuntime,
} from "@/lib/creative/identity/runtime/CreativeIdentityAtlasRuntime";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export const CreativeIdentityAtlasTemporalDirectionRuntime = {
  async create(input = {}) {
    const organizationId = input.organization_id;
    const project = object(input.project);
    const brief = object(input.brief);
    const assets = list(input.assets);
    if (!organizationId) throw new Error("organization_id required");
    if (!project.id) throw new Error("creative_project_id required");

    const directed = await CreativeMeasuredUniversalTemporalDirectionRuntime.create(input);
    const plan = object(directed.plan);
    const profiles = list(
      plan.identity_profiles ||
      plan.subject_profiles ||
      brief.metadata?.universal_subject_profiles ||
      brief.metadata?.universal_asset_intelligence?.person_profiles,
    );

    if (!profiles.length) return directed;

    const materialization = await CreativeIdentityAtlasRuntime.materialize({
      organization_id: organizationId,
      creative_project_id: project.id,
      profiles,
      assets,
      policy: {
        ...object(project.metadata?.identity_atlas_policy),
        ...object(brief.metadata?.identity_atlas_policy),
      },
    });
    if (!materialization.all_materialized) {
      throw new Error("IDENTITY_ATLAS_MATERIALIZATION_REQUIRED");
    }

    return {
      ...directed,
      plan: CreativeIdentityAtlasRuntime.attachToPlan(
        plan,
        materialization,
      ),
      identity_atlas_materialization: materialization,
    };
  },
};
