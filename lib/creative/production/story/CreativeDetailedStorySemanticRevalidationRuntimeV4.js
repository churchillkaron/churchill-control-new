import {
  CreativeDetailedStorySemanticRevalidationRuntimeV3,
} from "@/lib/creative/production/story/CreativeDetailedStorySemanticRevalidationRuntimeV3";

const RUNTIME_VERSION =
  "CREATIVE_DETAILED_STORY_SEMANTIC_REVALIDATION_V4_EVIDENCE";

const RECLASSIFIED_CODES = new Set([
  "CAMERA_PROGRESSION_IN_STATIC_FRAME",
  "MULTIPLE_TIME_STATES_IN_STATIC_FRAME",
  "OVER_COORDINATED_PERFORMANCE_DIRECTION",
]);

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function object(value) {
  return