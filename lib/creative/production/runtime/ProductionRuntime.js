import {
  prepareAssets,
} from "../workers/AssetPreparationWorker";

import {
  buildProductionPlan,
} from "../workers/PlanningWorker";

import {
  generateOutput,
} from "../workers/GenerationWorker";

import {
  reviewOutput,
} from "../workers/QualityWorker";

import {
  publishOutput,
} from "../workers/PublishingWorker";

export async function runProduction(
  production,
) {

  await prepareAssets(
    production
  );

  await buildProductionPlan(
    production
  );

  await generateOutput(
    production
  );

  await reviewOutput(
    production
  );

  await publishOutput(
    production
  );

  return production;

}
