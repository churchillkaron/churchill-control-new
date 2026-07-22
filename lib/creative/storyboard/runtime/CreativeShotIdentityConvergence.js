function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function normalized(value = "") {
  return String(value).trim().toLowerCase();
}

function semanticTitles(scene = {}, sceneIndex = 0) {
  const title = String(scene.title || `Scene ${sceneIndex + 1}`).trim();
  const text = normalized(title);

  if (/climax|synchronized|peak/.test(text)) {
    return [
      "Climax — Synchronized Room Peak",
      "Climax — Emotional Payoff",
    ];
  }

  if (/logo|cta|handle|invitation|endcard/.test(text)) {
    return [
      "Brand Reveal — Authentic Logo Frame",
      "Invitation CTA — Post-production Endcard",
    ];
  }

  return [
    `${title} — Establishing Action`,
    `${title} — Detail & Payoff`,
  ];
}

function semanticPurpose(scene = {}, shotIndex = 0) {
  const title = String(scene.title || "the scene").trim();
  const text = normalized(title);

  if (/climax|synchronized|peak/.test(text)) {
    return shotIndex === 0
      ? "Unify the DJ cue, lighting change, crowd response, and venue identity in one controlled peak image."
      : "Land the film peak through one memorable human reaction and a brand-specific visual detail that hands cleanly into the endcard.";
  }

  if (/logo|cta|handle|invitation|endcard/.test(text)) {
    return shotIndex === 0
      ? "Reveal the approved venue identity or logo using authentic reference geometry and a stable brand-safe composition."
      : "Hold a clean release-ready frame for invitation copy, social handle, and channel-specific CTA applied in post-production.";
  }

  return shotIndex === 0
    ? `Establish the geography, subject, and primary directed action for ${title}.`
    : `Reveal the tactile detail, human reaction, product truth, or emotional payoff that completes ${title}.`;
}

export function convergeCreativeShotIdentities(creativePlan = {}) {
  const plan = clone(creativePlan) || {};
  const usedTitles = new Set();

  plan.scenes = (Array.isArray(plan.scenes) ? plan.scenes : []).map(
    (scene, sceneIndex) => {
      const desired = semanticTitles(scene, sceneIndex);
      const shots = (Array.isArray(scene.shots) ? scene.shots : []).map(
        (shot, shotIndex) => {
          const baseTitle = desired[shotIndex] ||
            `${String(scene.title || `Scene ${sceneIndex + 1}`).trim()} — Shot ${shotIndex + 1}`;
          let title = baseTitle;
          let suffix = 2;

          while (usedTitles.has(normalized(title))) {
            title = `${baseTitle} — Variation ${suffix}`;
            suffix += 1;
          }

          usedTitles.add(normalized(title));

          return {
            ...shot,
            shot_number: shotIndex + 1,
            title,
            purpose: semanticPurpose(scene, shotIndex),
            metadata: {
              ...(shot.metadata || {}),
              semantic_identity_convergence: true,
              semantic_identity_scene_number: sceneIndex + 1,
            },
          };
        },
      );

      return {
        ...scene,
        scene_number: sceneIndex + 1,
        shots,
      };
    },
  );

  return plan;
}
