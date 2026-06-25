import {
  refreshSessionReadModel,
} from "@/lib/restaurant/read-models";

export async function execute({
  organizationId,
  sessionId,
}) {
  return refreshSessionReadModel({
    organizationId,
    sessionId,
  });
}
