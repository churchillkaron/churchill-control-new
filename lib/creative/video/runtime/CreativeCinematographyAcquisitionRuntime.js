const CONTRACT = "AVANTIQO_CINEMATOGRAPHY_ACQUISITION_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalized(value) {
  return text(value).toLowerCase();
}

function firstText(...values) {
  for (const value of values) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return "";
}

function parseNumber(source, patterns = []) {
  const value = text(source);
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match) continue;
    const number = finite(match[1]);
    if (number !== null) return number;
  }
  return null;
}

function graphicOnly(shot = {}, task = {}) {
  const tokens = [
    shot.type,
    shot.kind,
    shot.shot_type,
    shot.media_type,
    task.type,
    task.capability,
    task.service_code,
  ]
    .map(normalized)
    .join(" ");
  return /(^|[._\s-])(graphic|graphics|title|title-card|card|typography|motion-graphics)([._\s-]|$)/.test(tokens);
}

function movementText(camera = {}) {
  return [
    camera.movement_path,
    camera.movement,
    camera.movement_speed,
    camera.stabilization,
    camera.lens_intent,
  ]
    .map(normalized)
    .filter(Boolean)
    .join(" ");
}

function inferRig(camera = {}) {
  const movement = movementText(camera);
  if (/\bfpv\b/.test(movement)) return "FPV_DRONE";
  if (/\b(drone|aerial|flyover|helicopter)\b/.test(movement)) return "DRONE";
  if (/\b(technocrane)\b/.test(movement)) return "TECHNOCRANE";
  if (/\b(crane|jib|boom|pedestal)\b/.test(movement)) return "CRANE_JIB";
  if (/\b(steadicam)\b/.test(movement)) return "STEADICAM";
  if (/\b(gimbal)\b/.test(movement)) return "GIMBAL";
  if (/\b(handheld|hand-held)\b/.test(movement)) return "HANDHELD";
  if (/\b(dolly|track|tracking|truck|push|pull|slider)\b/.test(movement)) return "DOLLY_TRACK";
  if (/\b(static|locked|locked-off|fixed|tripod)\b/.test(movement)) return "TRIPOD";
  if (/\b(orbit|arc)\b/.test(movement)) return "GIMBAL_OR_DOLLY";
  return "VIRTUAL_CAMERA";
}

function inferSensor(camera = {}) {
  const lens = normalized(camera.lens_intent);
  if (/\b(65mm|large format|large-format)\b/.test(lens)) return "LARGE_FORMAT_EQUIVALENT";
  if (/\b(super\s*35|s35)\b/.test(lens)) return "SUPER_35_EQUIVALENT";
  if (/\b(full[-\s]?frame)\b/.test(lens)) return "FULL_FRAME_EQUIVALENT";
  return "FULL_FRAME_EQUIVALENT";
}

function inferFocalLength(camera = {}) {
  const explicitFromIntent = parseNumber(camera.lens_intent, [/(\d+(?:\.\d+)?)\s*mm\b/i]);
  if (explicitFromIntent !== null) return explicitFromIntent;
  const framing = normalized(camera.framing);
  const lens = normalized(camera.lens_intent);
  if (/macro|probe/.test(lens) || /extreme close|insert|detail/.test(framing)) return 100;
  if (/telephoto|compression/.test(lens)) return 100;
  if (/close[-\s]?up|portrait/.test(framing)) return 85;
  if (/medium close/.test(framing)) return 65;
  if (/medium/.test(framing)) return 50;
  if (/ultra[-\s]?wide/.test(lens) || /establish|aerial|drone/.test(framing)) return 24;
  if (/wide/.test(lens) || /wide|master|two[-\s]?shot/.test(framing)) return 35;
  return 50;
}

function inferAperture(camera = {}) {
  const explicitFromIntent = parseNumber(camera.lens_intent, [/(?:t|f)\/?\s*(\d+(?:\.\d+)?)/i]);
  if (explicitFromIntent !== null) return explicitFromIntent;
  const lens = normalized(camera.lens_intent);
  if (/macro|probe/.test(lens)) return 4;
  if (/shallow|bokeh|portrait|selective focus/.test(lens)) return 2;
  if (/deep focus|deep-focus/.test(lens)) return 5.6;
  return 2.8;
}

function inferShutterAngle(camera = {}) {
  const candidates = [camera.shutter_angle, camera.lens_intent, camera.movement_path];
  for (const candidate of candidates) {
    const parsed = parseNumber(candidate, [/(\d+(?:\.\d+)?)\s*(?:deg|degree|degrees|°)/i]);
    if (parsed !== null) return parsed;
  }
  return 180;
}

function inferDepthOfField(camera = {}) {
  const lens = normalized(camera.lens_intent);
  if (/macro|probe/.test(lens)) return "MACRO_SELECTIVE";
  if (/shallow|bokeh|portrait|selective focus/.test(lens)) return "SHALLOW_SELECTIVE";
  if (/deep focus|deep-focus/.test(lens)) return "DEEP_FOCUS";
  return "CONTROLLED_NARRATIVE";
}

function inferMotionCurve(camera = {}) {
  const movement = movementText(camera);
  if (/\b(static|locked|locked-off|fixed)\b/.test(movement)) return "LOCKED";
  if (/\b(handheld|hand-held)\b/.test(movement)) return "ORGANIC_HUMAN";
  if (/\b(track|tracking|dolly|truck|slider|flyover)\b/.test(movement)) return "SMOOTH_LINEAR";
  return "EASE_IN_OUT";
}

function inferAcceleration(camera = {}) {
  const movement = movementText(camera);
  if (/\b(static|locked|locked-off|fixed)\b/.test(movement)) return "NONE";
  if (/\b(handheld|hand-held)\b/.test(movement)) return "HUMAN_MICRO_VARIATION";
  if (/\b(rapid|fast|whip)\b/.test(movement)) return "CONTROLLED_HIGH_ACCELERATION";
  return "SMOOTH_LOW_JERK";
}

function frameAnchor(value) {
  if (typeof value === "string") return text(value);
  const source = object(value);
  return firstText(
    source.description,
    source.composition,
    source.visual,
    source.intent,
    source.summary,
    source.action,
    source.subject,
  );
}

function inferredAnchor(shot = {}, camera = {}, role = "start") {
  const frame = object(shot.frame_plan);
  const direct = role === "start"
    ? frame.opening_frame || frame.openingFrame || shot.opening_frame_plan
    : frame.closing_frame || frame.closingFrame || shot.closing_frame_plan;
  const fromFrame = frameAnchor(direct);
  if (fromFrame) return fromFrame;
  const subject = firstText(shot.subject, shot.title, "principal subject");
  const framing = firstText(camera.framing, "authored composition");
  if (role === "start") return `${framing} anchored on ${subject}`;
  const action = firstText(shot.action, shot.performance, camera.movement_motivation, "the authored beat resolves");
  return `${framing} resolves on ${subject} after ${action}`;
}

function inferKelvin(lighting = {}) {
  for (const candidate of [lighting.colour, lighting.color, lighting.source, lighting.exposure_intent]) {
    const parsed = parseNumber(candidate, [/(\d{4,5})\s*k\b/i]);
    if (parsed !== null) return parsed;
  }
  const value = [lighting.colour, lighting.color, lighting.source].map(normalized).join(" ");
  if (/tungsten|candle|warm practical|incandescent/.test(value)) return 3200;
  if (/golden hour|sunset|sunrise/.test(value)) return 4500;
  if (/daylight|overcast|window light|sunlight/.test(value)) return 5600;
  if (/moon|cool|blue hour/.test(value)) return 6500;
  return 4300;
}

function inferKeyFillRatio(lighting = {}) {
  const parsed = parseNumber(lighting.contrast, [/(\d+(?:\.\d+)?)\s*[:/]\s*1\b/i]);
  if (parsed !== null) return parsed;
  const value = normalized(lighting.contrast);
  if (/silhouette|extreme/.test(value)) return 16;
  if (/high|hard|dramatic|chiaroscuro/.test(value)) return 8;
  if (/low|soft|flat|beauty/.test(value)) return 2;
  return 4;
}

function inferKeyQuality(lighting = {}) {
  const value = [lighting.source, lighting.direction, lighting.contrast].map(normalized).join(" ");
  if (/hard|direct sun|hard source/.test(value)) return "HARD";
  if (/soft|diffused|overcast|bounce/.test(value)) return "SOFT";
  return "MIXED_CONTROLLED";
}

function inferredPracticalStrategy(lighting = {}) {
  const value = [lighting.source, lighting.colour, lighting.color].map(normalized).join(" ");
  if (/practical|lamp|candle|neon|screen|window|signage|fire/.test(value)) {
    return "INTEGRATE_AND_BALANCE_VISIBLE_PRACTICALS";
  }
  return "MOTIVATED_BY_SCENE_SOURCES";
}

function inferredVolumetricStrategy(shot = {}) {
  const vfx = object(shot.vfx);
  const value = JSON.stringify(vfx).toLowerCase();
  return /atmos|haze|fog|mist|smoke|volumetric|dust/.test(value)
    ? "MATCH_GOVERNED_ATMOSPHERICS"
    : "NONE";
}

function validateRange({ issues, code, label, value, min, max }) {
  const number = finite(value);
  if (number === null || number < min || number > max) {
    issues.push({ code, field: label, value });
  }
}

function compileCamera(shot = {}) {
  const camera = object(shot.camera);
  const explicit = object(camera.acquisition);
  const inferred = [];
  const pick = (field, fallback) => {
    if (explicit[field] !== undefined && explicit[field] !== null && text(explicit[field])) {
      return explicit[field];
    }
    inferred.push(`camera.${field}`);
    return fallback;
  };
  return {
    values: {
      rig_type: text(pick("rig_type", inferRig(camera))),
      sensor_format: text(pick("sensor_format", inferSensor(camera))),
      focal_length_mm: finite(pick("focal_length_mm", inferFocalLength(camera))),
      aperture_t_stop: finite(pick("aperture_t_stop", inferAperture(camera))),
      shutter_angle: finite(pick("shutter_angle", inferShutterAngle(camera))),
      depth_of_field: text(pick("depth_of_field", inferDepthOfField(camera))),
      motion_curve: text(pick("motion_curve", inferMotionCurve(camera))),
      movement_acceleration: text(pick("movement_acceleration", inferAcceleration(camera))),
      start_anchor: text(pick("start_anchor", inferredAnchor(shot, camera, "start"))),
      end_anchor: text(pick("end_anchor", inferredAnchor(shot, camera, "end"))),
      subject_lock: text(pick("subject_lock", firstText(camera.focus_target, shot.subject, "principal subject"))),
      motion_reference_asset_id: firstText(explicit.motion_reference_asset_id, explicit.motionReferenceAssetId) || null,
    },
    inferred,
  };
}

function compileLighting(shot = {}) {
  const lighting = object(shot.lighting);
  const explicit = object(lighting.photometry);
  const inferred = [];
  const pick = (field, fallback) => {
    if (explicit[field] !== undefined && explicit[field] !== null && text(explicit[field])) {
      return explicit[field];
    }
    inferred.push(`lighting.${field}`);
    return fallback;
  };
  return {
    values: {
      color_temperature_kelvin: finite(pick("color_temperature_kelvin", inferKelvin(lighting))),
      key_fill_ratio: finite(pick("key_fill_ratio", inferKeyFillRatio(lighting))),
      key_quality: text(pick("key_quality", inferKeyQuality(lighting))),
      negative_fill: text(pick("negative_fill", "CONTROLLED_AS_NEEDED")),
      practical_strategy: text(pick("practical_strategy", inferredPracticalStrategy(lighting))),
      volumetric_strategy: text(pick("volumetric_strategy", inferredVolumetricStrategy(shot))),
    },
    inferred,
  };
}

function validate(camera, lighting) {
  const issues = [];
  const requiredCameraText = [
    "rig_type",
    "sensor_format",
    "depth_of_field",
    "motion_curve",
    "movement_acceleration",
    "start_anchor",
    "end_anchor",
    "subject_lock",
  ];
  for (const field of requiredCameraText) {
    if (!text(camera[field])) issues.push({ code: "CINEMATOGRAPHY_CAMERA_FIELD_MISSING", field });
  }
  const requiredLightingText = [
    "key_quality",
    "negative_fill",
    "practical_strategy",
    "volumetric_strategy",
  ];
  for (const field of requiredLightingText) {
    if (!text(lighting[field])) issues.push({ code: "CINEMATOGRAPHY_LIGHTING_FIELD_MISSING", field });
  }
  validateRange({ issues, code: "CINEMATOGRAPHY_FOCAL_LENGTH_INVALID", label: "focal_length_mm", value: camera.focal_length_mm, min: 5, max: 600 });
  validateRange({ issues, code: "CINEMATOGRAPHY_APERTURE_INVALID", label: "aperture_t_stop", value: camera.aperture_t_stop, min: 0.7, max: 45 });
  validateRange({ issues, code: "CINEMATOGRAPHY_SHUTTER_ANGLE_INVALID", label: "shutter_angle", value: camera.shutter_angle, min: 1, max: 360 });
  validateRange({ issues, code: "CINEMATOGRAPHY_COLOR_TEMPERATURE_INVALID", label: "color_temperature_kelvin", value: lighting.color_temperature_kelvin, min: 1000, max: 40000 });
  validateRange({ issues, code: "CINEMATOGRAPHY_KEY_FILL_RATIO_INVALID", label: "key_fill_ratio", value: lighting.key_fill_ratio, min: 1, max: 128 });
  return issues;
}

export function compileCreativeCinematographyAcquisition({ shot = {}, task = {} } = {}) {
  if (graphicOnly(shot, task)) {
    return {
      contract: CONTRACT,
      version: 1,
      status: "NOT_APPLICABLE",
      applicability: "GRAPHIC_ONLY",
      camera: null,
      lighting: null,
      inferred_fields: [],
      blocking_issues: [],
      warnings: [],
      evidence: { physical_cinematography_required: false },
    };
  }
  const camera = compileCamera(shot);
  const lighting = compileLighting(shot);
  const blockingIssues = validate(camera.values, lighting.values);
  const inferredFields = [...camera.inferred, ...lighting.inferred];
  const warnings = [];
  if (inferredFields.length) {
    warnings.push({
      code: "CINEMATOGRAPHY_ACQUISITION_INFERRED",
      fields: inferredFields,
      message: "Physical acquisition values were deterministically resolved from governed shot direction because explicit values were absent.",
    });
  }
  if (camera.values.motion_reference_asset_id) {
    warnings.push({
      code: "CINEMATOGRAPHY_MOTION_REFERENCE_REQUESTED",
      asset_id: camera.values.motion_reference_asset_id,
      message: "Provider routing must preserve the governed camera-motion reference when the selected engine supports it.",
    });
  }
  return {
    contract: CONTRACT,
    version: 1,
    status: blockingIssues.length ? "BLOCKED" : "READY",
    applicability: "PHYSICAL_VIDEO",
    camera: camera.values,
    lighting: lighting.values,
    inferred_fields: inferredFields,
    blocking_issues: blockingIssues,
    warnings,
    evidence: {
      physical_cinematography_required: true,
      rig_type: camera.values.rig_type,
      focal_length_mm: camera.values.focal_length_mm,
      aperture_t_stop: camera.values.aperture_t_stop,
      shutter_angle: camera.values.shutter_angle,
      motion_curve: camera.values.motion_curve,
      start_anchor: camera.values.start_anchor,
      end_anchor: camera.values.end_anchor,
      color_temperature_kelvin: lighting.values.color_temperature_kelvin,
      key_fill_ratio: lighting.values.key_fill_ratio,
      motion_reference_bound: Boolean(camera.values.motion_reference_asset_id),
    },
  };
}

export function assertCreativeCinematographyAcquisition(value = {}) {
  if (value.contract !== CONTRACT) {
    throw new Error("CINEMATOGRAPHY_ACQUISITION_CONTRACT_REQUIRED");
  }
  if (value.status === "BLOCKED") {
    const codes = list(value.blocking_issues).map((issue) => text(issue?.code)).filter(Boolean);
    throw new Error(`CINEMATOGRAPHY_ACQUISITION_BLOCKED:${codes.join(",")}`);
  }
  return value;
}

export const CreativeCinematographyAcquisitionRuntime = Object.freeze({
  contract: CONTRACT,
  compile: compileCreativeCinematographyAcquisition,
  assert: assertCreativeCinematographyAcquisition,
});
