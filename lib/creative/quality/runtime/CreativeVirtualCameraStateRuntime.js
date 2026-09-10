function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function cameraShot(shot = {}) {
  const camera = object(shot.camera);
  return Object.keys(camera).length > 0 && !/^(none|not applicable)$/i.test(text(camera.framing));
}

export function creativeVirtualCameraStateFailures(shot = {}) {
  if (!cameraShot(shot)) return [];
  const state = object(shot.virtual_camera_state);
  const start = object(state.start);
  const end = object(state.end);
  const failures = [];
  const focalStart = finite(start.focal_length_mm);
  const focalEnd = finite(end.focal_length_mm);
  const distanceStart = finite(start.subject_distance_m);
  const distanceEnd = finite(end.subject_distance_m);

  if (focalStart === null || focalStart < 8 || focalStart > 600) failures.push("SHOT_VIRTUAL_CAMERA_START_FOCAL_LENGTH_REQUIRED");
  if (focalEnd === null || focalEnd < 8 || focalEnd > 600) failures.push("SHOT_VIRTUAL_CAMERA_END_FOCAL_LENGTH_REQUIRED");
  if (distanceStart === null || distanceStart <= 0) failures.push("SHOT_VIRTUAL_CAMERA_START_SUBJECT_DISTANCE_REQUIRED");
  if (distanceEnd === null || distanceEnd <= 0) failures.push("SHOT_VIRTUAL_CAMERA_END_SUBJECT_DISTANCE_REQUIRED");
  if (finite(start.camera_height_m) === null) failures.push("SHOT_VIRTUAL_CAMERA_START_HEIGHT_REQUIRED");
  if (finite(end.camera_height_m) === null) failures.push("SHOT_VIRTUAL_CAMERA_END_HEIGHT_REQUIRED");
  if (finite(start.roll_degrees) === null || finite(end.roll_degrees) === null) failures.push("SHOT_VIRTUAL_CAMERA_ROLL_STATE_REQUIRED");
  if (focalStart !== null && focalEnd !== null && Math.abs(focalEnd - focalStart) > 1 && state.zoom_or_lens_change_declared !== true) {
    failures.push("SHOT_VIRTUAL_CAMERA_UNDECLARED_FOCAL_CHANGE");
  }
  if (text(state.focus_behavior).length < 12) failures.push("SHOT_VIRTUAL_CAMERA_FOCUS_BEHAVIOR_REQUIRED");
  if (text(state.perspective_intent).length < 15) failures.push("SHOT_VIRTUAL_CAMERA_PERSPECTIVE_INTENT_REQUIRED");

  return [...new Set(failures)];
}

export const CreativeVirtualCameraStateRuntime = Object.freeze({
  contract: "CREATIVE_VIRTUAL_CAMERA_STATE_V1",
  evaluate(shot = {}) {
    const failures = creativeVirtualCameraStateFailures(shot);
    return {
      contract: this.contract,
      passed: failures.length === 0,
      failures,
      zero_provider_calls: true,
      zero_media_generation: true,
    };
  },
});
