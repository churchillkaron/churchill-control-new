export function createOrganizationService({

  organization_id,

  service_category_id,

  service_id,

  solution_id,

  package_id,

  status,

  managed_by,

  authorization_required,

  usage_enabled,

  billing_enabled,

  health,

  activated_at,

  suspended_at,

}) {

  return {

    organization_id,

    service_category_id,

    service_id,

    solution_id,

    package_id,

    status,

    managed_by,

    authorization_required,

    usage_enabled,

    billing_enabled,

    health,

    activated_at,

    suspended_at,

  };

}
