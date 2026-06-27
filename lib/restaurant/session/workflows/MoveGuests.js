import { moveGuestsBetweenTables } from "@/lib/restaurant/services/moveGuestsBetweenTables";

export async function execute({
  organizationId,
  payload = {},
  actor = null,
}) {
  return moveGuestsBetweenTables({
    organizationId,
    sourceTableId: payload.sourceTableId || payload.source_table_id,
    targetTableId: payload.targetTableId || payload.target_table_id,
    actor,
  });
}
