import {
  executeKitchenCommand,
} from "@/lib/restaurant/kitchen/services/KitchenApplicationService";

export async function execute({
  load,
  save,
}) {
  return executeKitchenCommand({
    load,
    save,
    command: async (aggregate) => {
      aggregate.markReady();
    },
  });
}
