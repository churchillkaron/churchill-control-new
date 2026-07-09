import {
  CreativeMissionRuntime,
} from "@/lib/creative/missions/runtime/CreativeMissionRuntime";

import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

import {
  RenderingRuntime,
} from "@/lib/creative/rendering/runtime/RenderingRuntime";

import {
  ResearchRuntime,
} from "@/lib/creative/research/runtime/ResearchRuntime";

import {
  ProductionRuntime,
} from "@/lib/creative/production/runtime/ProductionRuntime";

import {
  CreativeBriefRuntime,
} from "@/lib/creative/brief/runtime/CreativeBriefRuntime";

import {
  CreativeConceptRuntime,
} from "@/lib/creative/concepts/runtime/CreativeConceptRuntime";

import {
  CreativeStrategyRuntime,
} from "@/lib/creative/strategy/runtime/CreativeStrategyRuntime";

import {
  StoryboardRuntime,
} from "@/lib/creative/storyboard/runtime/StoryboardRuntime";

import {
  ProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";

import {
  ShotRuntime,
} from "@/lib/creative/shots/runtime/ShotRuntime";

import {
  ExecutionRuntime,
} from "@/lib/creative/execution/runtime/ExecutionRuntime";

import {
  AIDirectorRuntime,
} from "@/lib/creative/director/runtime/AIDirectorRuntime";

export const CREATIVE_DOCUMENT_REGISTRY = {

  CreativeMission: {
    id: "CreativeMission",
    runtime: CreativeMissionRuntime,
    collection: "missions",
    root: true,
  },

  CreativeBrief: {
    id: "CreativeBrief",
    runtime: CreativeBriefRuntime,
    collection: "briefs",
  },

  CreativeConcept: {
    id: "CreativeConcept",
    runtime: CreativeConceptRuntime,
    collection: "concepts",
  },

  CreativeStrategy: {
    id: "CreativeStrategy",
    runtime: CreativeStrategyRuntime,
    collection: "strategies",
  },

  AIDirectorDecision: {
    id: "AIDirectorDecision",
    runtime: AIDirectorRuntime,
    collection: "directorDecisions",
  },

  ExecutionPlan: {
    id: "ExecutionPlan",
    runtime: ExecutionRuntime,
    collection: "executionPlans",
  },

  Shot: {
    id: "Shot",
    runtime: ShotRuntime,
    collection: "shots",
  },

  ProductionGraph: {
    id: "ProductionGraph",
    runtime: ProductionGraphRuntime,
    collection: "productionGraphs",
  },

  Storyboard: {
    id: "Storyboard",
    runtime: StoryboardRuntime,
    collection: "storyboards",
  },

  CreativeAsset: {
    id: "CreativeAsset",
    runtime: CreativeAssetsRuntime,
    collection: "assets",
  },

  RenderJob: {
    id: "RenderJob",
    runtime: RenderingRuntime,
    collection: "renders",
  },

  Research: {
    id: "Research",
    runtime: ResearchRuntime,
    collection: "research",
  },

  Production: {
    id: "Production",
    runtime: ProductionRuntime,
    collection: "production",
  },

};

export function getCreativeDocument(name) {
  return CREATIVE_DOCUMENT_REGISTRY[name] ?? null;
}
