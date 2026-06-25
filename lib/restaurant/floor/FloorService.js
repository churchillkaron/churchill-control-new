export async function executeFloorCommand({
  organizationId,
  action,
  payload = {},
  actor = null,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  switch (action) {
    case "layout":
      return (await import("./queries/GetFloorLayout"))
        .GetFloorLayout({
          organizationId,
          ...payload,
        });

    case "tables":
      return (await import("./queries/GetTables"))
        .GetTables({
          organizationId,
          ...payload,
        });

    case "merge":
      return (await import("./actions/MergeTables"))
        .MergeTables({
          organizationId,
          ...payload,
          actor,
        });

    case "transfer":
      return (await import("./actions/TransferTable"))
        .TransferTable({
          organizationId,
          ...payload,
          actor,
        });

    case "moveGuests":
      return (await import("./actions/MoveGuests"))
        .MoveGuests({
          organizationId,
          ...payload,
          actor,
        });

    default:
      throw new Error(
        `Unsupported Restaurant Floor action: ${action}`
      );
  }
}
