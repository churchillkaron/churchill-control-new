function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function movingSubject(shot = {}) {
  const motion = object(shot.subject_motion_choreography);
  if (motion.required === true) return true;
  const source = `${text(shot.action)} ${text(shot.frame_plan?.progression)} ${text(shot.performance_direction)}`.toLowerCase();
  return /(move|moves|moving|drive|drives|fly|flies|approach|depart|takeoff|take off|land|landing|walk|run|travel|advance|retreat|cross|descend|rise|accelerat|decelerat)/.test(source);
}

export function creativeSubjectMotionChoreographyFailures(shot = {}) {
  if (!movingSubject(shot)) return [];
  const motion = object(shot.subject_motion_choreography);
  const failures = [];
  if (text(motion.start_state).length < 15) failures.push("SHOT_SUBJECT_MOTION_START_STATE_REQUIRED");
  if (text(motion.path).length < 20) failures.push("SHOT_SUBJECT_MOTION_PATH_REQUIRED");
  if (text(motion.speed_profile).length < 15) failures.push("SHOT_SUBJECT_MOTION_SPEED_PROFILE_REQUIRED");
  if (text(motion.screen_direction).length < 8) failures.push("SHOT_SUBJECT_MOTION_SCREEN_DIRECTION_REQUIRED");
  if (!list(motion.clearance_and_contact_constraints).length) failures.push("SHOT_SUBJECT_MOTION_CLEARANCE_CONSTRAINTS_REQUIRED");
  if (text(motion.end_state).length < 15) failures.push("SHOT_SUBJECT_MOTION_END_STATE_REQUIRED");
  const combined = `${text(motion.start_state)} ${text(motion.path)} ${text(motion.end_state)}`.toLowerCase();
  if (/(spawn|teleport|materializ|emerg(?:e|es|ing)?\s+from\s+inside|appear(?:s|ed|ing)?\s+from\s+inside|originate(?:s|d|ing)?\s+inside|pass(?:es|ed|ing)?\s+through)/.test(combined)) {
    failures.push("SHOT_SUBJECT_MOTION_IMPOSSIBLE_EMERGENCE");
  }
  if (/left-to-right|left to right/.test(text(motion.screen_direction).toLowerCase()) &&
      /right-to-left|right to left/.test(text(motion.path).toLowerCase())) {
    failures.push("SHOT_SUBJECT_MOTION_DIRECTION_CONTRADICTION");
  }
  if (/right-to-left|right to left/.test(text(motion.screen_direction).toLowerCase()) &&
      /left-to-right|left to right/.test(text(motion.path).toLowerCase())) {
    failures.push("SHOT_SUBJECT_MOTION_DIRECTION_CONTRADICTION");
  }
  return [...new Set(failures)];
}

export const CreativeSubjectMotionChoreographyRuntime = Object.freeze({
  contract: "CREATIVE_SUBJECT_MOTION_CHOREOGRAPHY_V1",
  evaluate(shot = {}) {
    const failures = creativeSubjectMotionChoreographyFailures(shot);
    return {
      contract: this.contract,
      passed: failures.length === 0,
      failures,
      zero_provider_calls: true,
      zero_media_generation: true,
    };
  },
});
