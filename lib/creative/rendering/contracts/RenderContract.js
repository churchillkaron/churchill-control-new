export function createRenderContract(
  production,
  deliverable,
  assets = [],
) {

  return {

    production_id:
      production.id,

    project_id:
      production.project_id,

    deliverable_id:
      production.deliverable_id,

    organization_id:
      production.organization_id,

    type:
      deliverable.type,

    quality:
      production.quality,

    policy:
      production.render_policy,

    assets,

    instructions: {},

    metadata: {},

  };

}
