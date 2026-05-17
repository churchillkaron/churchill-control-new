import requireRole from "../requireRole";

export default async function requireOwner() {
  return await requireRole({
    roles: [
      "owner",
    ],
  });
}
