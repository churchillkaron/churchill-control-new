export function filterWorkspaceNav(
  items = [],
  context = {}
) {
  const {
    role = "staff",
    permissions = [],
  } = context;

  return items.filter((item) => {
    if (!item) return false;

    if (
      item.roles &&
      !item.roles.includes(role)
    ) {
      return false;
    }

    if (
      item.permission &&
      !permissions.includes(item.permission)
    ) {
      return false;
    }

    return true;
  });
}
