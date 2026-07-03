export function canExecuteERPAction({ permissions = [], required = [] }) {
  if (!required.length) return true;
  return required.every(permission => permissions.includes(permission));
}
