import { closeTableSession } from "@/lib/restaurant/services/closeTableSession";

export async function execute({
  organizationId,
  payload = {},
  actor = null,
}) {
  return closeTableSession({
    organizationId,
    sessionId: payload.sessionId || payload.session_id,
    actor,
  });
}
