import { RESTAURANT_WORKFLOWS } from "@/lib/restaurant/workflows";

export function registerDomainWorkflows() {
  return [
    ...RESTAURANT_WORKFLOWS,
  ];
}
