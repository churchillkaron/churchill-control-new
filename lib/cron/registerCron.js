import { CRON_REGISTRY } from "./cronRegistry";

export default async function registerCron() {

  return {
    success: true,
    registered:
      CRON_REGISTRY.length,
    jobs:
      CRON_REGISTRY,
  };

}
