export function checkPermission(
  user,
  permission
) {

  if (!user)
    return false;

  const permissions =

    user.permissions || [];

  if (
    permissions.includes("*")
  ) {

    return true;

  }

  return permissions.includes(
    permission
  );

}
