import crypto from "node:crypto";

import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";

const CONTRACT = "AVANTIQO_MOTION_GRAPHICS_V1";

const TYPES = new Set([
  "TITLE",
  "LOWER_THIRD",
  "CALLOUT",
  "CAPTION",
  "LOGO_BUG",
  "LOGO_STING",
  "END_CARD",
  "DATA_LABEL",
  "KINETIC_TEXT",
]);

const ANIMATIONS = new Set([
  "NONE",
  "FADE",
  "SLIDE_UP",
  "SLIDE_DOWN",
  "SLIDE_LEFT",
  "SLIDE_RIGHT",
  "SCALE",
  "REVEAL",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value, limit = 10000) {
  return String(value ?? "").trim().slice(0, limit);
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(value ?? null))).digest("hex");
}

function normalizedColor(value, fallback = "#FFFFFF") {
  const candidate = text(value, 32);
  return /^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/.test(candidate)
    ? candidate.toUpperCase()
    : fallback;
}

function number01(value, fallback = 1) {
  const number = finite(value, fallback);
  return Math.max(0, Math.min(1, number));
}

function rawItems(value) {
  if (Array.isArray(value)) return value;
  const source = object(value);
  if (Array.isArray(source.items)) return source.items;
  if (Array.isArray(source.elements)) return source.elements;
  if (Object.keys(source).length && (source.type || source.kind || source.text || source.logo_asset_node_id)) {
    return [source];
  }
  return [];
}

function projectItems(project = {}) {
  const metadata = object(project.metadata);
  return rawItems(
    metadata.motion_graphics ||
    metadata.motionGraphics ||
    metadata.graphics_timeline ||
    metadata.graphicsTimeline,
  );
}

function shotItems(shot = {}, timeline = {}) {
  const requirements = list(timeline.metadata?.requirements);
  const edits = list(timeline.metadata?.edit_decision_list);
  const requirementIndex = requirements.findIndex((requirement) =>
    text(requirement?.shot_id, 500) === text(shot.id, 500),
  );
  const edit = edits.find((entry) => Number(entry.requirement_index) === requirementIndex);
  const offset = finite(edit?.timeline_in_seconds, 0);
  return rawItems(shot.graphics).map((item) => ({
    ...object(item),
    timeline_in_seconds:
      offset + finite(item.timeline_in_seconds ?? item.start_seconds, 0),
    source_shot_id: shot.id,
    source_scene_id: shot.scene_id || null,
  }));
}

function normalizeItem(raw = {}, index = 0, totalDuration = null) {
  const item = object(raw);
  const type = text(item.type || item.kind || item.role || "TITLE", 100).toUpperCase();
  const start = Math.max(0, finite(
    item.timeline_in_seconds ?? item.timelineInSeconds ?? item.start_seconds ?? item.startSeconds,
    0,
  ));
  const defaultDuration = totalDuration === null
    ? 3
    : Math.max(0.25, totalDuration - start);
  const duration = Math.max(0.1, finite(
    item.duration_seconds ?? item.durationSeconds,
    defaultDuration,
  ));
  const entrance = Math.max(0, Math.min(duration / 2, finite(
    item.entrance_duration_seconds ?? item.entranceDurationSeconds,
    Math.min(0.35, duration / 4),
  )));
  const exit = Math.max(0, Math.min(duration / 2, finite(
    item.exit_duration_seconds ?? item.exitDurationSeconds,
    Math.min(0.3, duration / 4),
  )));
  const typography = object(item.typography);
  const position = object(item.position);
  const background = object(item.background);
  const animation = text(item.animation || item.animation_type || "FADE", 100).toUpperCase();

  return {
    element_id: text(item.element_id || item.id || `motion-graphic-${index + 1}`, 500),
    type,
    exact_text: text(item.exact_text ?? item.text ?? item.copy, 6000) || null,
    logo_asset_node_id: text(
      item.logo_asset_node_id || item.logoAssetNodeId || item.asset_node_id,
      500,
    ) || null,
    timeline_in_seconds: start,
    duration_seconds: duration,
    timeline_out_seconds: start + duration,
    entrance_duration_seconds: entrance,
    exit_duration_seconds: exit,
    animation,
    easing: text(item.easing || "EASE_IN_OUT", 100).toUpperCase(),
    position: {
      x: position.x ?? item.x ?? "CENTER",
      y: position.y ?? item.y ?? "CENTER",
      anchor: text(position.anchor || item.anchor || "CENTER", 100).toUpperCase(),
      width: finite(position.width ?? item.width),
      height: finite(position.height ?? item.height),
      margin_x: finite(position.margin_x ?? position.marginX ?? 64, 64),
      margin_y: finite(position.margin_y ?? position.marginY ?? 64, 64),
    },
    typography: {
      font_asset_id: text(
        typography.font_asset_id || typography.fontAssetId || item.font_asset_id,
        500,
      ) || null,
      family: text(typography.family || item.font_family, 300) || null,
      weight: finite(typography.weight ?? item.font_weight, 400),
      style: text(typography.style || item.font_style || "Regular", 100),
      exact_font: typography.exact === true || item.exact_font === true,
      brand_locked: typography.brand_locked === true || item.brand_locked === true,
      size_px: Math.max(8, finite(typography.size_px ?? typography.font_size ?? item.font_size, 64)),
      color: normalizedColor(typography.color || item.color),
      tracking: finite(typography.tracking, 0),
      line_spacing: finite(typography.line_spacing ?? typography.leading, null),
    },
    background: {
      enabled: background.enabled === true || Boolean(background.color || item.background_color),
      color: normalizedColor(background.color || item.background_color, "#000000"),
      opacity: number01(background.opacity ?? item.background_opacity, 0.55),
      padding_x: Math.max(0, finite(background.padding_x ?? background.paddingX, 28)),
      padding_y: Math.max(0, finite(background.padding_y ?? background.paddingY, 18)),
    },
    opacity: number01(item.opacity, 1),
    safe_area_required: item.safe_area_required !== false,
    source_shot_id: item.source_shot_id || null,
    source_scene_id: item.source_scene_id || null,
    semantic_role: text(item.semantic_role || item.purpose, 500) || null,
  };
}

function validateItem(item, totalDuration) {
  const blockers = [];
  if (!item.element_id) blockers.push("MOTION_GRAPHICS_ELEMENT_ID_REQUIRED");
  if (!TYPES.has(item.type)) blockers.push(`MOTION_GRAPHICS_TYPE_UNSUPPORTED:${item.type}`);
  if (!ANIMATIONS.has(item.animation)) blockers.push(`MOTION_GRAPHICS_ANIMATION_UNSUPPORTED:${item.animation}`);
  const textType = !["LOGO_BUG", "LOGO_STING"].includes(item.type);
  if (textType && !item.exact_text) blockers.push(`MOTION_GRAPHICS_EXACT_TEXT_REQUIRED:${item.element_id}`);
  if (textType && !item.typography.font_asset_id && !item.typography.family) {
    blockers.push(`MOTION_GRAPHICS_FONT_BINDING_REQUIRED:${item.element_id}`);
  }
  if (["LOGO_BUG", "LOGO_STING"].includes(item.type) && !item.logo_asset_node_id) {
    blockers.push(`MOTION_GRAPHICS_LOGO_ASSET_REQUIRED:${item.element_id}`);
  }
  if (item.duration_seconds <= 0) blockers.push(`MOTION_GRAPHICS_DURATION_INVALID:${item.element_id}`);
  if (totalDuration !== null && item.timeline_out_seconds > totalDuration + 0.001) {
    blockers.push(`MOTION_GRAPHICS_TIMING_OUT_OF_RANGE:${item.element_id}`);
  }
  if (item.entrance_duration_seconds + item.exit_duration_seconds > item.duration_seconds + 0.001) {
    blockers.push(`MOTION_GRAPHICS_ANIMATION_HANDLES_INVALID:${item.element_id}`);
  }
  return blockers;
}

async function plan({ organization_id, creative_project_id, timeline } = {}) {
  if (!organization_id || !creative_project_id || !timeline?.id) {
    throw new Error("MOTION_GRAPHICS_SCOPE_REQUIRED");
  }
  const project = await CreativeProjectRepository.getById(creative_project_id);
  if (!project || text(project.organization_id) !== text(organization_id)) {
    throw new Error("Creative project not found");
  }
  const shots = await ShotRuntime.list({ organization_id, creative_project_id });
  const totalDuration = finite(
    timeline.metadata?.total_duration_seconds ?? timeline.technical?.duration_seconds,
    null,
  );
  const inputs = [
    ...projectItems(project),
    ...shots.flatMap((shot) => shotItems(shot, timeline)),
  ];
  if (!inputs.length) {
    return {
      contract: CONTRACT,
      applicable: false,
      status: "NOT_APPLICABLE",
      elements: [],
      blockers: [],
      contract_hash: null,
    };
  }
  const elements = inputs.map((item, index) => normalizeItem(item, index, totalDuration));
  const duplicateIds = elements
    .map((item) => item.element_id)
    .filter((id, index, values) => values.indexOf(id) !== index);
  const blockers = [
    ...new Set([
      ...duplicateIds.map((id) => `MOTION_GRAPHICS_DUPLICATE_ELEMENT_ID:${id}`),
      ...elements.flatMap((item) => validateItem(item, totalDuration)),
    ]),
  ];
  const base = {
    contract: CONTRACT,
    version: 1,
    provider_neutral: true,
    provider_prompt_persisted: false,
    deterministic_text_required: true,
    deterministic_logo_required: true,
    organization_id,
    creative_project_id,
    timeline_asset_node_id: timeline.id,
    timeline_identity: timeline.metadata?.timeline_identity || null,
    duration_seconds: totalDuration,
    elements,
    policy: {
      generated_text_pixels_forbidden: true,
      generated_logo_redraw_forbidden: true,
      exact_business_copy_preserved: true,
      exact_font_asset_required_when_brand_locked: true,
      safe_area_enforced: true,
      graphics_are_timeline_aware: true,
      repair_is_element_bounded: true,
      motion_graphics_do_not_retime_editorial_picture: true,
      motion_graphics_do_not_modify_master_audio: true,
    },
  };
  const contractHash = hash(base);
  return {
    ...base,
    applicable: true,
    status: blockers.length ? "BLOCKED" : "READY",
    blockers,
    contract_hash: contractHash,
  };
}

export const CreativeMotionGraphicsRuntime = Object.freeze({
  contract: CONTRACT,
  types: Object.freeze([...TYPES]),
  animations: Object.freeze([...ANIMATIONS]),
  plan,
});

export const AVANTIQO_MOTION_GRAPHICS_CONTRACT = CONTRACT;
