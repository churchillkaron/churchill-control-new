export const CREATIVE_PRODUCTION_ROOM_STAGES = Object.freeze([
  Object.freeze({ id: "RESEARCH_ROOM", order: 1, phase: "PREPRODUCTION" }),
  Object.freeze({ id: "CREATIVE_FLOOR", order: 2, phase: "PREPRODUCTION" }),
  Object.freeze({ id: "CONCEPT_COMPETITION", order: 3, phase: "PREPRODUCTION" }),
  Object.freeze({ id: "TRIBUNAL", order: 4, phase: "PREPRODUCTION" }),
  Object.freeze({ id: "TECHNICAL_SCOUT", order: 5, phase: "PREPRODUCTION" }),
  Object.freeze({ id: "PREVIS", order: 6, phase: "PREPRODUCTION" }),
  Object.freeze({ id: "DEPARTMENT_BREAKDOWN", order: 7, phase: "PREPRODUCTION" }),
  Object.freeze({ id: "VIRTUAL_REHEARSAL", order: 8, phase: "PREPRODUCTION" }),
  Object.freeze({ id: "PRODUCTION_UNITS", order: 9, phase: "PRODUCTION" }),
  Object.freeze({ id: "DAILIES", order: 10, phase: "PRODUCTION" }),
  Object.freeze({ id: "EDITORIAL", order: 11, phase: "POST" }),
  Object.freeze({ id: "VFX", order: 12, phase: "POST" }),
  Object.freeze({ id: "COLOR", order: 13, phase: "POST" }),
  Object.freeze({ id: "SOUND_MUSIC", order: 14, phase: "POST" }),
  Object.freeze({ id: "MASTER_DIRECTOR_REVIEW", order: 15, phase: "FINAL" }),
  Object.freeze({ id: "MASTERING", order: 16, phase: "FINAL" }),
  Object.freeze({ id: "RELEASE", order: 17, phase: "FINAL" }),
]);

export const PREPRODUCTION_GATE_STAGE = "VIRTUAL_REHEARSAL";
export const PRODUCTION_ENTRY_STAGE = "PRODUCTION_UNITS";
export const FINAL_RELEASE_STAGE = "RELEASE";

export function productionRoomStage(id) {
  return CREATIVE_PRODUCTION_ROOM_STAGES.find((stage) => stage.id === String(id || "").trim().toUpperCase()) || null;
}