export const MUSIC_SFX_CERTIFICATION_FIXTURES = Object.freeze([
  { id:"alarm_clock", category:"mechanical_real_world", duration_seconds:4, file_name:"alarm-clock.wav", instruction:"A harsh digital bedside alarm clock ringing repeatedly at 06:00 in a dark quiet bedroom, urgent electronic beeps with realistic small-room reflections, no music and no voice." },
  { id:"footsteps_wood", category:"foley", duration_seconds:5, file_name:"footsteps-wood.wav", instruction:"Close realistic leather shoes walking at a natural pace across an old wooden floor in a quiet interior, distinct heel and sole contact, subtle floor creaks, no music and no voice." },
  { id:"north_sea_wind", category:"ambience", duration_seconds:6, file_name:"north-sea-wind.wav", instruction:"Cold open-air North Sea ambience on an offshore platform, steady strong wind, distant ocean movement and faint industrial structure resonance, no music, no alarms and no voice." },
  { id:"cinematic_impact", category:"impact", duration_seconds:4, file_name:"cinematic-impact.wav", instruction:"A single premium cinematic low-frequency impact for a luxury film transition, deep controlled sub hit with a short metallic body and natural decay, no melody, no voice and no repeated beat." },
  { id:"whoosh_transition", category:"transition", duration_seconds:4, file_name:"whoosh-transition.wav", instruction:"A sophisticated fast cinematic whoosh passing left to right with clean air movement and a tight elegant tail, suitable for a premium visual transition, no music and no voice." },
  { id:"machine_texture", category:"cinematic_texture", duration_seconds:6, file_name:"machine-texture.wav", instruction:"Close tactile industrial machine texture: heavy precision mechanism engaging, layered servos, metal contact and restrained hydraulic movement, realistic scale, no music and no voice." },
]);

export const MUSIC_SFX_CERTIFICATION_REQUIRED_CATEGORIES = Object.freeze(
  MUSIC_SFX_CERTIFICATION_FIXTURES.map((fixture) => fixture.category),
);
