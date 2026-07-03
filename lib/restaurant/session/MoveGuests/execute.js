import { repository } from "./repository";

export async function execute({ context, payload = {} }) {
  return repository({
    organizationId: context.organization_id,
    payload,
  });
}
