import { splitTableGroup } from "@/lib/restaurant/services/splitTableGroup";

export async function execute({
  organizationId,
  payload = {},
  actor = null,
}) {
  return splitTableGroup({
    organizationId,
    masterTableId: payload.masterTableId || payload.master_table_id,
    actor,
  });
}
