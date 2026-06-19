import { processKitchenEvents } from "../lib/workers/kitchen/processKitchenEvents.js";

async function run() {
  console.log("[KITCHEN WORKER] running...");

  const result = await processKitchenEvents();

  console.log("[KITCHEN WORKER RESULT]", result);
}

run();

setInterval(async () => {
  try {
    await run();
  } catch (err) {
    console.error("[KITCHEN WORKER ERROR]", err);
  }
}, 5000);
