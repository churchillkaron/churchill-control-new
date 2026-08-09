import checkOrganizationPermission from "@/lib/permissions/checkPermission";

export default async function checkPermission({
  organization_id,
  organizationId,
  role,
  permission_key,
  module,
  action,
}) {
  return checkOrganizationPermission({
    organization_id,
    organizationId,
    role,
    permission_key,
    module,
    action,
  });
}
