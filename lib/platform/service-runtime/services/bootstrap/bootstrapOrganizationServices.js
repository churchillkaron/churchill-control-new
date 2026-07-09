import { execute } from "@/lib/ubte";

export async function bootstrapOrganizationServices(services, context) {
  for (const service of services) {
    await execute({
      capability: service.capability,
      context,
      payload: service
    });
  }
}
