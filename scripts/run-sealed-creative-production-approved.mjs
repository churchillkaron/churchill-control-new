#!/usr/bin/env node

import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

// Install the complete production runtime in deterministic order. The dossier
// evidence wrapper must be installed after the dossier gate is loaded and
// before the resume entrypoint begins its 27-task preparation pass.
await import("./creative-runtime-bootstrap.mjs");
await import(
  "@/lib/creative/execution/runtime/CreativeApprovedProductionTaskCostGuardRuntime"
);
await import(
  "@/lib/creative/execution/runtime/CreativeSealedProductionDispatchPreparationRuntime"
);
await import(
  "@/lib/creative/production/dossier/runtime/CreativeProductionDossierEvidenceRuntime"
);
await import(
  "@/lib/platform/service-runtime/execution/FalPendingQueueBindingRuntime"
);
await import(
  "@/lib/platform/service-runtime/execution/ServicePendingPollResilienceRuntime"
);

await import("./resume-sealed-creative-production-approved.mjs");
