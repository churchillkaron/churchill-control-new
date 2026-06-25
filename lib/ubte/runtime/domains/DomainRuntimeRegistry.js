import { RestaurantRuntime } from "@/lib/restaurant/RestaurantRuntime";

export const DOMAIN_RUNTIMES = {
  restaurant: RestaurantRuntime,
};

export function getDomainRuntime(domain) {
  const runtime = DOMAIN_RUNTIMES[domain];

  if (!runtime) {
    throw new Error(`Domain runtime not registered: ${domain}`);
  }

  return runtime;
}
