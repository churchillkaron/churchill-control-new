import requireRole from "../requireRole";

export default async function requireManager() {
  return await requireRole({
    roles: [
      "owner",
      "admin",
      "manager",
    ],
  });
}
