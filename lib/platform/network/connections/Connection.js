export function createConnection({
  from,
  to,
  type,
  status = "active",
}) {
  return {
    from,
    to,
    type,
    status,
    created_at: new Date().toISOString(),
  };
}
