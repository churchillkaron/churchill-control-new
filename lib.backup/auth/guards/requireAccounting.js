import requireRole from "../requireRole";

export default async function requireAccounting() {
  return await requireRole({
    roles: [
      "owner",
      "admin",
      "accounting",
    ],
  });
}
