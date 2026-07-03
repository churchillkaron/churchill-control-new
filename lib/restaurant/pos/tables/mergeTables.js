import { executeSessionCommand } from "@/lib/restaurant/session/runtime/SessionService";

export async function mergeTables({
  sourceTableId,
  targetTableId,
  context,
}) {
  return executeSessionCommand({
    context,
    action: "merge",
    payload: {
      sourceTableId,
      targetTableId,
    },
  });
}
