import createTenant from "./createTenant";

import createDefaultRoles from "./setup/createDefaultRoles";

import createDefaultPermissions from "./setup/createDefaultPermissions";

export default async function runTenantSetup({
  name,
  slug,
}) {

  const tenant =
    await createTenant({
      name,
      slug,
    });

  if (
    !tenant.success
  ) {
    return tenant;
  }

  await createDefaultRoles({
    tenant_id:
      tenant.tenant.id,
  });

  await createDefaultPermissions({
    tenant_id:
      tenant.tenant.id,
  });

  return {
    success: true,
    tenant:
      tenant.tenant,
  };
}
