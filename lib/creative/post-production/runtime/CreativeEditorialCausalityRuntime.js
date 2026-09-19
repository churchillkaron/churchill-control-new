export const CREATIVE_EDITORIAL_CAUSALITY_CONTRACT = "CREATIVE_EDITORIAL_CAUSALITY_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function text(value) {
  return String(value ?? "").trim();
}
function lower(value) {
  return text(value).toLowerCase();
}

const MOTIVATIONS = Object.freeze([
  "THREAT",
  "GAZE",
  "IMPACT",
  "MOTION",
  "SOUND",
  "CONCEALMENT",
  "REVEAL",
  "REACTION",
  "MATCH_ACTION",
  "SPATIAL_REORIENTATION",
  "RHYTHM_BREAK",
  "SILENCE",
]);

function transitionText(shot = {}) {
  return lower([shot.transition_out, shot.transition_in, shot.editorial_causality?.cut_motivation, shot.editorial_causality?.cut_trigger].map(text).join(" "));
}

function inferMotivation(shot = {}, next = {}) {
  const source = lower([
    shot.purpose, shot.action, shot.transition_out,
    next?.purpose, next?.action, next?.transition_in,
    shot.audio?.silence, shot.audio?.sync_events,
  ].map((value) => typeof value === "string" ? value : JSON.stringify(value || "")).join(" "));
  const rules = [
    ["THREAT", /threat|drone|pursuer|search beam|danger|closing distance/],
    ["GAZE", /look|glance|eyeline|sees|spots|turns toward/],
    ["IMPACT", /impact|strike|hit|lightning|collision|branch snap|slam/],
    ["MOTION", /cut on motion|match motion|runs|moves|whip|crosses frame/],
    ["SOUND", /j-cut|audio lead|sound bridge|hears|rotor|breath|thunder|footstep/],
    ["CONCEALMENT", /occlusion|conceal|hidden|behind tree|foreground wipe|blocked/],
    ["REVEAL", /reveal|discover|expose|emerge|appears/],
    ["REACTION", /reaction|flinch|breath catch|eyes snap|stumble|hesitat/],
    ["MATCH_ACTION", /match action|continuation|same action/],
    ["SPATIAL_REORIENTATION", /reorient|geography|establish|wide|orientation/],
    ["RHYTHM_BREAK", /interrupt|rhythm break|smash cut|punctuation/],
    ["SILENCE", /silence|density drop|mute|sound falls away/],
  ];
  return rules.find(([, pattern]) => pattern.test(source))?.[0] || null;
}

export function evaluateEditorialCausality({ scene = {}, shots = [] } = {}) {
  const failures = [];
  const boundaries = [];
  const shotList = list(shots);

  for (let index = 0; index < shotList.length - 1; index += 1) {
    const from = shotList[index];
    const to = shotList[index + 1];
    const explicit = object(from.editorial_causality);
    const motivation = text(explicit.cut_motivation).toUpperCase() || inferMotivation(from, to);
    const trigger = text(explicit.cut_trigger);
    const handoff = text(explicit.information_handoff);
    const soundBridge = text(explicit.sound_bridge);
    const visualMatch = text(explicit.visual_match_or_contrast);
    const withheld = text(explicit.what_is_withheld);
    const revealed = text(explicit.what_changes_after_cut);

    if (!motivation || !MOTIVATIONS.includes(motivation)) {
      failures.push({
        code: "EDITORIAL_CAUSAL_MOTIVATION_REQUIRED",
        path: "shots." + index + ".editorial_causality.cut_motivation",
        message: "Every cut needs one explicit causal motivation: " + MOTIVATIONS.join(", ") + ".",
      });
    }
    if (trigger.length < 10) {
      failures.push({
        code: "EDITORIAL_CUT_TRIGGER_REQUIRED",
        path: "shots." + index + ".editorial_causality.cut_trigger",
        message: "State the exact visible or audible event that earns the cut.",
      });
    }
    if (handoff.length < 14) {
      failures.push({
        code: "EDITORIAL_INFORMATION_HANDOFF_REQUIRED",
        path: "shots." + index + ".editorial_causality.information_handoff",
        message: "State what information, action, threat, gaze or sound continues across the cut.",
      });
    }
    if (revealed.length < 12) {
      failures.push({
        code: "EDITORIAL_STATE_CHANGE_REQUIRED",
        path: "shots." + index + ".editorial_causality.what_changes_after_cut",
        message: "A cut must change knowledge, pressure, proximity, emotion, scale or rhythm.",
      });
    }

    const transition = transitionText(from);
    if (/dissolve|morph|glow|flash transition|zoom transition/.test(transition) &&
        !/reveal|time|memory|dream|transformation|impact/.test(lower(trigger + " " + handoff))) {
      failures.push({
        code: "EDITORIAL_DECORATIVE_TRANSITION_FORBIDDEN",
        path: "shots." + index + ".transition_out",
        message: "Decorative transition language is not causally justified by the cut.",
      });
    }

    boundaries.push({
      from_shot_id: from.id || null,
      to_shot_id: to.id || null,
      motivation,
      cut_trigger: trigger || null,
      information_handoff: handoff || null,
      sound_bridge: soundBridge || null,
      visual_match_or_contrast: visualMatch || null,
      what_is_withheld: withheld || null,
      what_changes_after_cut: revealed || null,
    });
  }

  const motivations = boundaries.map((boundary) => boundary.motivation).filter(Boolean);
  if (motivations.length >= 4 && new Set(motivations).size < 3) {
    failures.push({
      code: "EDITORIAL_MOTIVATION_MONOTONY",
      path: "shots",
      message: "The sequence relies on too few cut motivations; vary threat, gaze, impact, sound, concealment, reveal, reaction, motion or rhythm as the story changes.",
    });
  }

  return {
    contract: CREATIVE_EDITORIAL_CAUSALITY_CONTRACT,
    passed: failures.length === 0,
    boundaries,
    failures,
    policy: {
      every_cut_must_be_earned: true,
      cut_must_change_audience_state: true,
      random_angle_change_forbidden: true,
      decorative_transition_forbidden: true,
      sound_may_lead_picture: true,
      concealment_may_motivate_cut: true,
      action_match_must_preserve_physics: true,
      aggressive_cutting_requires_causal_legibility: true,
    },
  };
}

export const CreativeEditorialCausalityRuntime = Object.freeze({
  contract: CREATIVE_EDITORIAL_CAUSALITY_CONTRACT,
  motivations: MOTIVATIONS,
  evaluate: evaluateEditorialCausality,
});
