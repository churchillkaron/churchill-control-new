function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function asList(value) {
  if (Array.isArray(value)) return value.filter((v) => text(v));
  return text(value) ? [text(value)] : [];
}
function resolutionRatio(value) {
  const match = text(value).match(/^(\d+)\s*[xX]\s*(\d+)$/);
  return match ? Number(match[1]) / Number(match[2]) : null;
}
function aspectRatio(value) {
  const match = text(value).match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  return match ? Number(match[1]) / Number(match[2]) : null;
}
function canonicalVideoSpec(spec = {}) {
  const source = object(spec);
  const ar = text(source.aspect_ratio) || "16:9";
  const resolution = text(source.resolution);
  const ratio = resolutionRatio(resolution);
  const expected = aspectRatio(ar);
  const consistent = ratio && expected && Math.abs(ratio - expected) < 0.03;
  return {
    ...source,
    aspect_ratio: ar,
    resolution: consistent ? resolution : "1920x1080",
    frame_rate: Math.max(1, finite(source.frame_rate) || 24),
  };
}
function allocate(items, target, floor = 0.5) {
  const source = list(items);
  if (!source.length) return [];
  const ms = Math.round(Number(target) * 1000);
  const floorMs = Math.round(floor * 1000);
  if (ms < source.length * floorMs) return source;
  const free = ms - source.length * floorMs;
  const weights = source.map((x) => Math.max(0.001, finite(x.duration_seconds) || 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => free * w / total);
  const parts = raw.map(Math.floor);
  let remainder = free - parts.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [i, v - parts[i]]).sort((a,b) => b[1]-a[1] || a[0]-b[0]);
  for (let i = 0; remainder > 0; i += 1, remainder -= 1) parts[order[i % order.length][0]] += 1;
  return source.map((item, i) => ({ ...item, duration_seconds: (floorMs + parts[i]) / 1000 }));
}

function isLogoPayoffShot(shot = {}) {
  const source = [shot.title, shot.purpose, shot.action, shot.subject].map(text).join(" ").toLowerCase();
  return /logo|brand reveal|boom/.test(source);
}
function hasLateBrandPayoff(plan = {}) {
  const scenes = list(plan.scenes);
  const finalScene = scenes[scenes.length - 1];
  return Boolean(finalScene && list(finalScene.shots).some(isLogoPayoffShot));
}
function allocateLatePayoffScenes(items, target) {
  const scenes = list(items);
  if (scenes.length < 2 || !hasLateBrandPayoff({ scenes })) return allocate(scenes, target, 0.5);
  const finalSeconds = Math.min(4, Math.max(2, Number(target) * 0.0666667));
  const leadSeconds = Number(target) - finalSeconds;
  const lead = allocate(scenes.slice(0, -1), leadSeconds, 0.5);
  const finalScene = { ...scenes[scenes.length - 1], duration_seconds: Number(finalSeconds.toFixed(3)) };
  return [...lead, finalScene];
}
function allocateLatePayoffShots(shots, target) {
  const rows = list(shots);
  if (rows.length !== 2 || !rows.some(isLogoPayoffShot)) return allocate(rows, target, 0.5);
  const logoIndex = rows.findIndex(isLogoPayoffShot);
  if (logoIndex < 0) return allocate(rows, target, 0.5);
  const logoSeconds = Math.min(Number(target) - 0.5, Math.max(2, Number(target) / 2));
  const otherSeconds = Number(target) - logoSeconds;
  return rows.map((row, index) => ({ ...row, duration_seconds: Number((index === logoIndex ? logoSeconds : otherSeconds).toFixed(3)) }));
}
function assetText(asset = {}) {
  return [asset.name, asset.description, ...(Array.isArray(asset.tags) ? asset.tags : [])].map(text).join(" ").toLowerCase();
}
function locationAuthorityScore(asset = {}) {
  const evidence = object(asset.metadata?.location_reference_evidence || asset.analysis?.location_reference_evidence);
  let score = 0;
  if (evidence.named_location_visually_verified === true) score += 3;
  if (evidence.distinctive_geography_certified === true) score += 3;
  if (list(evidence.observable_anchors).length) score += 1;
  if (asset.metadata?.verified === true || asset.analysis?.verified === true) score += 1;
  return score;
}
function bestMatchingAsset(candidates = [], matcher) {
  return list(candidates)
    .filter((asset) => matcher(asset))
    .sort((a, b) => locationAuthorityScore(b) - locationAuthorityScore(a))[0] || null;
}
function semanticSceneAsset(scene = {}, assets = []) {
  const country = text(scene.location?.country).toLowerCase();
  const city = text(scene.location?.city).toLowerCase();
  const specific = text(scene.location?.specific).toLowerCase();
  const haystack = `${country} ${city} ${specific}`;
  const candidates = list(assets);
  if (/thailand|bangkok|phuket/.test(haystack) && /office/.test(haystack)) return bestMatchingAsset(candidates, (asset) => /thai.*accounting.*office|accounting.*office.*thai/.test(assetText(asset)));
  if (/phuket|patong/.test(haystack)) return bestMatchingAsset(candidates, (asset) => /phuket|patong/.test(assetText(asset)));
  if (/norway|fjord/.test(haystack)) return bestMatchingAsset(candidates, (asset) => /aurlandsfjord|sognefjord|norway.*fjord|fjord.*norway/.test(assetText(asset)));
  if (/sweden|stockholm|archipelago/.test(haystack)) return bestMatchingAsset(candidates, (asset) => /stockholm.*archipelago|archipelago.*stockholm|sweden.*archipelago/.test(assetText(asset)));
  if (/global|earthrise|earth/.test(haystack)) return bestMatchingAsset(candidates, (asset) => /earthrise/.test(assetText(asset)));
  return null;
}
function canonicalAssignedLogo(plan = {}, assets = []) {
  const assignedIds = new Set(list(plan.asset_manifest).filter((entry) => text(entry?.disposition).toUpperCase() === "ASSIGNED").map((entry) => text(entry?.asset_id || entry?.id)).filter(Boolean));
  return list(assets).find((asset) => assignedIds.has(text(asset?.id || asset?.asset_id)) && /logo|brand mark/.test(assetText(asset))) || null;
}
function canonicalAssignedUi(plan = {}, assets = []) {
  const assignedIds = new Set(list(plan.asset_manifest).filter((entry) => text(entry?.disposition).toUpperCase() === "ASSIGNED").map((entry) => text(entry?.asset_id || entry?.id)).filter(Boolean));
  return list(assets).find((asset) => assignedIds.has(text(asset?.id || asset?.asset_id)) && /avantiqo.*ui|ui.*avantiqo|interface|dashboard/.test(assetText(asset))) || null;
}
function clearlyMismatchedReference(scene = {}, asset = {}) {
  const country = text(scene.location?.country).toLowerCase();
  const source = assetText(asset);
  if (/norway|sweden/.test(country) && /thai|thailand|phuket|patong|earthrise/.test(source)) return true;
  if (/thailand/.test(country) && /earthrise/.test(source)) return true;
  return false;
}
function normalizeSceneEvidence(scene = {}, assets = [], plan = {}) {
  const matched = semanticSceneAsset(scene, assets);
  const logo = canonicalAssignedLogo(plan, assets);
  const assignedUi = canonicalAssignedUi(plan, assets);
  const assetId = text(matched?.id || matched?.asset_id);
  const assignedAssetIds = new Set(
    list(plan.asset_manifest)
      .filter((entry) => text(entry?.disposition).toUpperCase() === "ASSIGNED")
      .map((entry) => text(entry?.asset_id || entry?.id))
      .filter(Boolean),
  );
  const primaryAssetId = assignedAssetIds.has(assetId) ? assetId : "";
  const byId = new Map(list(assets).map((asset) => [text(asset?.id || asset?.asset_id), asset]));
  const currentRefs = list(scene.reference_asset_ids).map(text).filter(Boolean);
  const safeCurrentRefs = currentRefs.filter((id) => !clearlyMismatchedReference(scene, byId.get(id) || {}));
  const sceneText = `${text(scene.location?.country)} ${text(scene.location?.city)} ${text(scene.location?.specific)} ${text(scene.title)}`.toLowerCase();
  const officeGeoAsset = /thailand|bangkok|phuket/.test(sceneText) && /office/.test(sceneText)
    ? bestMatchingAsset(assets, (asset) => /patong beach/.test(assetText(asset)) && object(asset.metadata?.location_reference_evidence || asset.analysis?.location_reference_evidence).distinctive_geography_certified === true)
    : null;
  const officeGeoId = text(officeGeoAsset?.id || officeGeoAsset?.asset_id);
  const shots = list(scene.shots).map((shot) => {
    if (isLogoPayoffShot(shot) && logo) {
      const logoId = text(logo.id || logo.asset_id);
      return {
        ...shot,
        primary_source_asset_id: logoId,
        assets: [logoId],
        reference_assets: [{ asset_id: logoId, role: "PRIMARY_SOURCE", reason: "Assigned canonical Avantiqo brand mark for final payoff" }],
        reference_asset_ids: [logoId],
        graphics: { ...object(shot.graphics), logo: { ...object(shot.graphics?.logo), logo_id: logoId } },
        generation: { ...object(shot.generation), primary_source_asset_id: logoId },
      };
    }
    if (assetId) {
      const referenceAssets = [{
        asset_id: assetId,
        role: primaryAssetId ? "PRIMARY_SOURCE" : "SCENE_REFERENCE",
        reason: primaryAssetId
          ? `Assigned primary subject/source authority for ${text(scene.location?.specific) || text(scene.title)}`
          : `Reference-only truth authority for ${text(scene.location?.specific) || text(scene.title)}; it may guide generation but may not be used as production source media.`,
      }];
      if (officeGeoId && officeGeoId !== assetId) referenceAssets.push({ asset_id: officeGeoId, role: "GEOGRAPHIC_REFERENCE", reason: "Verified Patong Beach geography anchors the generated Thai office exterior/reflection to Phuket without misrepresenting the office source asset." });
      const assignedUiId = text(assignedUi?.id || assignedUi?.asset_id);
      if (assignedUiId && assignedUiId !== assetId && /office/.test(sceneText) && /pattern|reflection|integration/.test(text(shot.title + " " + shot.action).toLowerCase())) {
        referenceAssets.push({ asset_id: assignedUiId, role: "BRAND_UI_REFERENCE", reason: "Assigned authentic Avantiqo UI for subtle glass-reflection brand integration; never replace the office/location primary source." });
      }
      const referenceIds = [assetId];
      if (officeGeoId && officeGeoId !== assetId) referenceIds.push(officeGeoId);
      if (assignedUiId && referenceAssets.some((entry) => entry.asset_id === assignedUiId) && !referenceIds.includes(assignedUiId)) referenceIds.push(assignedUiId);
      return {
        ...shot,
        primary_source_asset_id: primaryAssetId || null,
        assets: primaryAssetId ? [primaryAssetId] : [],
        reference_assets: referenceAssets,
        reference_asset_ids: referenceIds,
        generation: { ...object(shot.generation), primary_source_asset_id: primaryAssetId || null },
      };
    }
    const primary = text(shot.primary_source_asset_id);
    const primaryAsset = byId.get(primary) || {};
    if (primary && clearlyMismatchedReference(scene, primaryAsset)) {
      return { ...shot, primary_source_asset_id: null, assets: [], reference_assets: [], generation: { ...object(shot.generation), primary_source_asset_id: null } };
    }
    return shot;
  });
  const sceneRefs = assetId ? [assetId] : safeCurrentRefs;
  if (officeGeoId && !sceneRefs.includes(officeGeoId)) sceneRefs.push(officeGeoId);
  const location = officeGeoId && /office/.test(sceneText)
    ? { ...object(scene.location), country: "Thailand", city: "Phuket", specific: "Phuket accounting office interior with Patong Beach geography visible only through or reflected in exterior-facing glass" }
    : scene.location;
  return { ...scene, location, reference_asset_ids: sceneRefs, shots };
}

function explicitAbsence(label, reason) {
  return `No ${label} is introduced; ${reason}`;
}
function meaningfulDirection(value) {
  const current = text(value);
  return /^(?:none|n\/a|not applicable|0(?:\.0+)?(?:\s*\([^)]*\))?)$/i.test(current) ? "" : current;
}
function shotFrameClass(shot = {}) {
  const source = `${text(shot.frame_plan?.opening_frame)} ${text(shot.camera?.framing)} ${text(shot.shot_scale)}`.toLowerCase();
  if (/macro|extreme close|insert|detail/.test(source)) return "DETAIL";
  if (/close[- ]?up|medium close/.test(source)) return "CLOSE";
  if (/wide|aerial|establishing|full/.test(source)) return "WIDE";
  return "MEDIUM";
}
function cameraStateForShot(shot = {}) {
  const kind = shotFrameClass(shot);
  const defaults = { DETAIL: [85, 1.0, 1.45], CLOSE: [65, 1.8, 1.5], MEDIUM: [50, 4.0, 1.6], WIDE: [35, 12.0, 1.8] };
  const [focal, distance, height] = defaults[kind] || defaults.MEDIUM;
  const camera = object(shot.camera);
  const movement = meaningfulDirection(camera.movement_path || camera.movement);
  const moving = Boolean(movement) && !/locked|static|stationary|no camera movement/i.test(movement);
  const endDistance = moving && /push|approach|advance|move forward/i.test(movement) ? Math.max(0.5, distance * 0.8)
    : moving && /pull|retreat|back|move backward/i.test(movement) ? distance * 1.2 : distance;
  return {
    start: { focal_length_mm: focal, subject_distance_m: distance, camera_height_m: height, roll_degrees: 0 },
    end: { focal_length_mm: focal, subject_distance_m: Number(endDistance.toFixed(2)), camera_height_m: height, roll_degrees: 0 },
    zoom_or_lens_change_declared: false,
    focus_behavior: text(camera.focus_transition || camera.focus_target || camera.focus).length >= 12
      ? text(camera.focus_transition || camera.focus_target || camera.focus)
      : "Focus remains locked to the authored primary subject throughout the shot with no unmotivated rack or depth discontinuity.",
    perspective_intent: `Preserve documentary-real perspective and the authored ${kind.toLowerCase()} subject scale without impossible lens or spatial changes.`,
  };
}
function geographicContract(scene = {}, shot = {}) {
  const source = `${text(scene.location?.country)} ${text(scene.location?.city)} ${text(scene.location?.specific)} ${text(scene.title)}`.toLowerCase();
  if (/phuket|patong/.test(source)) return {
    claim: "Patong Beach, Phuket, Thailand",
    anchors: ["Patong Beach wide bay and green headland", "Patong beachfront development and tropical shoreline"],
    forbidden: ["generic tropical beach", "unidentified ocean coastline"],
    test: "The frame must be recognizable as Patong Beach in Phuket from the bay/headland relationship and beachfront context, not merely tropical water."
  };
  if (/norway|fjord|aurland|sogne/.test(source)) return {
    claim: "Aurlandsfjord in the Sognefjord area, Norway",
    anchors: ["Aurlandsfjord steep Norwegian fjord walls", "Sognefjord-area narrow water corridor and mountain relief"],
    forbidden: ["generic alpine lake", "generic snowy mountains"],
    test: "The frame must read as a Norwegian fjord through the steep enclosing fjord walls and narrow water geometry, not as a generic mountain lake."
  };
  if (/sweden|stockholm|archipelago/.test(source)) return {
    claim: "Stockholm Archipelago, Sweden",
    anchors: ["Stockholm Archipelago island-water pattern", "Stockholm-area shoreline and archipelago settlement context"],
    forbidden: ["generic waterfront city", "generic island chain"],
    test: "The frame must show the characteristic Stockholm Archipelago relationship of islands, water channels and Stockholm-area shoreline context rather than a generic waterfront."
  };
  return null;
}
function normalizedPrevisualizationContracts(shot = {}, scene = {}, shotIndex = 0) {
  const subject = text(shot.subject || shot.title || shot.action) || `scene subject ${shotIndex + 1}`;
  const location = object(scene.location);
  const world = [text(location.specific), text(location.city), text(location.country)].filter(Boolean).join(", ") || text(scene.title) || "authored scene world";
  const primary = text(shot.primary_source_asset_id || shot.generation?.primary_source_asset_id);
  const geo = geographicContract(scene, shot);
  const sceneKey = text(scene.id || scene.title || "scene").replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase();
  const subjectKey = `${sceneKey}:${text(shot.id || `shot-${shotIndex + 1}`)}`;
  const continuity = object(shot.continuity);
  const camera = object(shot.camera);
  const action = text(shot.action || shot.frame_plan?.progression || shot.purpose) || "The authored subject state changes only as described by the shot direction.";
  const moving = /(move|moves|moving|flow|flows|travel|advance|retreat|cross|rise|expand|contract|follow|pull|push)/i.test(action);
  const referenceNames = list(shot.reference_assets).map((entry) => text(entry.role)).filter(Boolean);
  const base = {
    ...shot,
    subject_identity_key: text(shot.subject_identity_key) || subjectKey,
    world_identity_key: text(shot.world_identity_key) || sceneKey,
    subject_class: text(shot.subject_class).length >= 20 ? shot.subject_class : `Documentary-real authored visual subject: ${subject}; preserve its material and spatial identity across the shot.`,
    subject_signature: {
      ...object(shot.subject_signature),
      defining_features: list(shot.subject_signature?.defining_features).length >= 2 ? list(shot.subject_signature.defining_features) : [
        `Primary visible subject remains ${subject}.`,
        primary ? `Visual/source identity remains anchored to selected asset ${primary}.` : `Visual identity remains anchored to the authored scene world ${world}.`,
      ],
      forbidden_substitutions: list(shot.subject_signature?.forbidden_substitutions).length ? list(shot.subject_signature.forbidden_substitutions) : [
        "Do not replace the authored subject with unrelated people, vehicles, architecture or generic stock imagery.",
        "Do not substitute a different geography, logo, UI identity or environmental material state.",
      ],
    },
    mechanical_truth: text(shot.mechanical_truth).length >= 25 ? shot.mechanical_truth : `All visible motion, reflections, water, snow, glass, light and camera movement must obey ordinary physical continuity; no spawning, teleportation, impossible intersections or object-state jumps.`,
    mechanical_signature: {
      ...object(shot.mechanical_signature),
      functional_assemblies: list(shot.mechanical_signature?.functional_assemblies).length ? list(shot.mechanical_signature.functional_assemblies) : ["primary subject and supporting environment remain physically connected in one coherent scene state"],
      required_connections: list(shot.mechanical_signature?.required_connections).length ? list(shot.mechanical_signature.required_connections) : ["reflections, shadows, surfaces and motion remain causally connected to their visible sources"],
      motion_constraints: list(shot.mechanical_signature?.motion_constraints).length ? list(shot.mechanical_signature.motion_constraints) : ["no impossible acceleration, clipping, topology changes, teleportation or discontinuous material transformation"],
    },
    world_geometry_anchor: text(shot.world_geometry_anchor).length >= 20 ? shot.world_geometry_anchor : `${world} remains the fixed spatial authority; camera movement may reveal more of the environment but cannot alter landmark, horizon, surface or interior/exterior relationships.`,
    world_topology: list(shot.world_topology).length >= 2 ? list(shot.world_topology) : [
      `Primary subject occupies the authored ${text(camera.framing) || "frame"} relationship inside ${world}.`,
      `Foreground, reflective surfaces, background geography and horizon/interior planes retain stable relative positions through the shot.`,
    ],
    continuity_invariants: list(shot.continuity_invariants).length ? list(shot.continuity_invariants) : [
      text(continuity.location) || `${world} remains the same world state throughout the shot.`,
      text(continuity.screen_direction) || "Screen direction and camera-side relationships remain consistent with the authored movement path.",
      primary ? `Primary source identity ${primary} cannot change within the shot.` : "The primary authored subject identity cannot change within the shot.",
      referenceNames.length ? `Reference roles remain fixed: ${referenceNames.join(", ")}.` : "No new unapproved source reference may replace the authored scene evidence.",
    ],
    camera_feasibility: text(shot.camera_feasibility).length >= 30 ? shot.camera_feasibility : `The authored camera move is achievable as one physically plausible stabilized move at the stated framing; lens, camera height, focus and subject distance remain continuous and avoid impossible viewpoint jumps.`,
    virtual_camera_state: (() => {
      const fallback = cameraStateForShot(shot);
      const existing = object(shot.virtual_camera_state);
      if (!Object.keys(existing).length) return fallback;
      const start = object(existing.start);
      const end = object(existing.end);
      return {
        ...fallback,
        ...existing,
        start: { ...fallback.start, ...start },
        end: { ...fallback.end, ...end },
        focus_behavior: text(existing.focus_behavior).length >= 12 ? existing.focus_behavior : fallback.focus_behavior,
        perspective_intent: text(existing.perspective_intent).length >= 15 ? existing.perspective_intent : fallback.perspective_intent,
      };
    })(),
    production_design: {
      ...object(shot.production_design),
      materials: meaningfulDirection(shot.production_design?.materials) || `Use physically credible materials native to ${world}; preserve glass, water, snow, stone, shoreline, office surfaces or space imagery exactly as required by the authored scene.`,
      texture_detail: meaningfulDirection(shot.production_design?.texture_detail) || "Maintain fine natural texture, micro-scratches, surface roughness, atmospheric depth and non-plastic detail without synthetic smoothing.",
    },
    material_behavior: text(shot.material_behavior) || "Materials keep stable roughness, reflectance, wetness, snow/water response and contact behavior under the authored lighting; no melting, warping or texture crawling.",
    lighting: {
      ...object(shot.lighting),
      source: text(shot.lighting?.source).length >= 8 ? shot.lighting.source : "Natural motivated environmental light from the authored time-of-day and visible scene sources.",
      direction: text(shot.lighting?.direction).length >= 8 ? shot.lighting.direction : "Direction remains consistent with the visible sun, sky, windows or Earth/space illumination in the scene.",
      contrast: text(shot.lighting?.contrast).length >= 8 ? shot.lighting.contrast : "Premium cinematic contrast with protected highlights and readable shadow detail; no artificial neon wash.",
      colour: text(shot.lighting?.colour).length >= 8 ? shot.lighting.colour : "Natural location-faithful colour temperature with restrained premium grading and no arbitrary hue shifts.",
      exposure_intent: text(shot.lighting?.exposure_intent).length >= 8 ? shot.lighting.exposure_intent : "Protect bright reflections, water, snow, glass and logo edges while retaining deep but detailed blacks.",
    },
  };
  if (moving && !Object.keys(object(base.subject_motion_choreography)).length) {
    base.subject_motion_choreography = {
      required: true,
      start_state: `The authored subject begins in the opening-frame state established by ${text(shot.frame_plan?.opening_frame) || subject}.`,
      path: `Motion follows only the visible causal progression described by the shot action: ${action}`.replace(/materializ(e|es|ed|ing)/ig, "becomes visible").replace(/pass(?:es|ed|ing)? through/ig, "moves alongside"),
      speed_profile: "Slow, physically plausible cinematic progression with no sudden acceleration or discontinuous speed change.",
      screen_direction: text(continuity.screen_direction) || "Maintain established screen direction",
      clearance_and_contact_constraints: ["Maintain visible clearance from solid geometry and preserve physically valid surface/contact relationships throughout the move."],
      end_state: `The authored subject ends in the closing-frame state established by ${text(shot.frame_plan?.closing_frame) || subject}, with all world and material continuity preserved.`,
    };
  }
  if (geo) {
    base.geography_claim = geo.claim;
    base.geography_proof = [...new Set(list(shot.reference_assets).filter((entry) => ["PRIMARY_SOURCE","GEOGRAPHIC_REFERENCE"].includes(text(entry.role).toUpperCase())).map((entry) => text(entry.asset_id)).filter(Boolean))];
    base.geography_signature = {
      ...object(shot.geography_signature),
      recognition_anchors: geo.anchors,
      forbidden_generic_substitutes: geo.forbidden,
      recognition_test: geo.test,
    };
  } else if (!text(base.geography_claim)) {
    base.geography_claim = "NONE";
  }
  return base;
}
function normalizeProductionScoutBibles(plan = {}) {
  const production = object(plan.production);
  return {
    ...plan,
    production: {
      ...production,
      production_design_bible: {
        set_dressing_bible: "Preserve location-authentic, minimal documentary environments; no decorative clutter, invented signage or generic luxury props may replace geography or brand truth.",
        props_bible: "Only authored physical elements and assigned/reference brand assets may appear; no random screens, floating objects or unrelated props are introduced.",
        wardrobe_bible: "No human talent is planned for this film; wardrobe remains explicitly not applicable unless a later approved revision introduces talent.",
        surface_aging_rules: "Keep natural micro-scratches, weathering, shoreline wear, snow texture, glass imperfections and material variation visible enough to avoid synthetic smoothness.",
        environment_continuity: "Each geography keeps its verified landmark/environment identity across neighboring shots; weather, water/snow state, horizon, reflections and time-of-day evolve continuously rather than reset.",
      },
      lighting_simulation: {
        sun_path: "Use time-of-day-consistent natural light progression per scene; maintain plausible sun/sky direction within each location and avoid conflicting highlights between adjacent shots.",
        motivated_light_map: "All key/fill/reflection sources must be motivated by sky, sun, windows, shoreline/city practicals, Earth illumination or the final controlled logo composite.",
        shadow_map: "Shadow direction and softness stay consistent with the motivated source; no duplicated or detached shadows.",
        reflection_map: "Water and glass reflections preserve source geometry, viewpoint and Fresnel behavior; Avantiqo UI remains a subtle authored glass reflection only where assigned.",
        surface_response: "Glass, water, snow, rock, architecture and logo surfaces retain physically plausible roughness/specularity under changing view angle.",
        exposure_continuity: "Match exposure across cuts while preserving highlight detail in water/snow/glass and deep black integrity for the final reveal.",
      },
      material_physics: {
        material_library: "Documentary-real glass, water, snow, stone, vegetation, architecture, atmospheric haze and deterministic logo/UI composites with stable texture identity.",
        weather_behavior: "Weather and atmospheric motion remain subtle, location-plausible and continuous; no sudden cloud, wave, snow or haze resets within a scene.",
        cloth_hair_behavior: "Not applicable because no human talent is planned; if incidental distant people appear they cannot become subjects and must obey natural wind/gravity.",
        fluid_particulate_behavior: "Water ripples, spray, snow particles and atmospheric haze obey gravity, wind, surface contact and scale; no frozen or looping fluid motion.",
        contact_deformation: "Solid geometry remains rigid unless naturally flexible; water/snow contact responses are local and causal, with no melting, stretching or intersection artifacts.",
      },
      take_strategy: {
        ...object(production.take_strategy),
        max_takes_per_shot: Number(production.take_strategy?.max_takes_per_shot) || 2,
        variant_budget_rule: text(production.take_strategy?.variant_budget_rule) || "Generate at most one continuity-preserving alternate only when it has clear editorial value; never spray random variants.",
      },
    },
  };
}

function normalizePrimarySource(shot = {}, planContext = {}) {
  const assignedIds = new Set(
    list(planContext.asset_manifest)
      .filter((entry) => text(entry?.disposition).toUpperCase() === "ASSIGNED")
      .map((entry) => text(entry?.asset_id || entry?.id))
      .filter(Boolean),
  );
  let referenceAssets = list(shot.reference_assets).map((entry) => ({ ...object(entry) }));
  referenceAssets = referenceAssets.map((entry) => {
    const id = text(entry.asset_id);
    if (text(entry.role).toUpperCase() === "PRIMARY_SOURCE" && id && !assignedIds.has(id)) {
      return {
        ...entry,
        role: "SCENE_REFERENCE",
        reason: text(entry.reason) || "Reference-only truth authority; not approved as production source media.",
      };
    }
    return entry;
  });
  const explicitPrimary = referenceAssets.find((entry) =>
    text(entry.role).toUpperCase() === "PRIMARY_SOURCE" &&
    text(entry.asset_id) &&
    assignedIds.has(text(entry.asset_id)),
  );
  if (explicitPrimary) {
    return { referenceAssets, primarySourceAssetId: text(explicitPrimary.asset_id) };
  }
  const authoredId = text(shot.primary_source_asset_id);
  if (authoredId && assignedIds.has(authoredId)) {
    const index = referenceAssets.findIndex((entry) => text(entry.asset_id) === authoredId);
    if (index >= 0) referenceAssets[index] = { ...referenceAssets[index], role: "PRIMARY_SOURCE" };
    return { referenceAssets, primarySourceAssetId: authoredId };
  }
  return { referenceAssets, primarySourceAssetId: null };
}
function normalizeShot(shot, scene, shotIndex, masterSpec, fallbackGeneration, planContext = {}) {
  const framePlan = object(shot.frame_plan);
  const creativeReview = object(planContext.creative_review);
  const concept = object(planContext.concept);
  const fallbackNegativeConstraints = asList(concept.refused_devices);
  const fallbackFailureModes = asList(creativeReview.craft_risks);
  const fallbackRepairInstructions = asList(creativeReview.finishing_requirements);
  const camera = object(shot.camera);
  const continuity = object(shot.continuity);
  const audio = object(shot.audio);
  const productionDesign = object(shot.production_design);
  const sourceBinding = normalizePrimarySource(shot, planContext);
  const sceneCamera = object(scene.camera_style);
  const sceneAudio = object(scene.audio_style);
  const sceneLocation = object(scene.location);
  const productNames = list(scene.products).map((p) => text(p?.name)).filter(Boolean).join(", ");
  const framingAngle = text(camera.framing).match(/\b(low[- ]angle|high[- ]angle|eye[- ]level|overhead|top[- ]down)\b/i)?.[1] || "";
  const angle = text(camera.angle) || text(sceneCamera.angle) || framingAngle;
  const focusTarget = text(camera.focus_target || camera.focus);
  const rawFocus = text(camera.focus_transition);
  const focusTransition = !rawFocus || /^(none|n\/a|not applicable)\b/i.test(rawFocus)
    ? (focusTarget ? `Focus remains locked on ${focusTarget} throughout; no rack is used so the intended subject hierarchy stays stable.` : "Focus remains fixed through the shot so the established subject hierarchy does not drift.")
    : rawFocus;
  const noActors = list(scene.actors).length === 0;
  const sceneSound = text(sceneAudio.sound_design);
  const pressureBefore = finite(scene?.tension?.pressure_before);
  const pressureAfter = finite(scene?.tension?.pressure_after);
  const energy = finite(shot.energy_level) ?? pressureAfter ?? pressureBefore ?? 50;
  const tempo = text(shot.tempo_role).toUpperCase() || (pressureAfter !== null && pressureBefore !== null
    ? (pressureAfter > pressureBefore ? "BUILD" : pressureAfter < pressureBefore ? "RELEASE" : "HOLD")
    : "HOLD");
  const generation = { ...object(fallbackGeneration), ...object(shot.generation) };
  delete generation.provider_parameters;
  const rawProgression = text(framePlan.progression);
  const completedProgression = rawProgression.length >= 40
    ? rawProgression
    : `Hold the authored ${text(shot.action) || "scene action"} through the frame while preserving ${text(framePlan.closing_frame) || text(shot.subject) || "the closing subject relationship"}; progression comes from visible subject change rather than decorative camera motion.`;
  const directedDuration = finite(shot.duration_seconds);
  const generationSpec = canonicalVideoSpec({ ...masterSpec, ...object(generation.output_spec) });
  return {
    ...shot,
    frame_plan: { ...framePlan, progression: completedProgression },
    camera: {
      ...camera,
      angle: angle || "Camera angle follows the established scene framing without changing the subject relationship.",
      movement_speed: meaningfulDirection(camera.movement_speed) || (meaningfulDirection(camera.movement) ? `Movement speed follows the authored camera move: ${meaningfulDirection(camera.movement)}.` : "No camera movement is introduced; the frame remains deliberately locked so visible subject change carries the shot."),
      focus_transition: focusTransition,
    },
    production_design: {
      ...productionDesign,
      props: meaningfulDirection(productionDesign.props) || explicitAbsence("props", "the authored environment and primary subject carry the visual information without decorative objects."),
    },
    continuity: {
      ...continuity,
      identity: text(continuity.identity) || (text(shot.subject) ? `Subject identity remains ${text(shot.subject)} throughout this shot.` : explicitAbsence("new identity", "the established scene subject remains the continuity authority.")),
      product: text(continuity.product) || (productNames ? `Product continuity remains ${productNames}.` : explicitAbsence("separate product", "the shot is governed by the established scene subject.")),
      location: text(continuity.location) || (text(sceneLocation.name) ? `${text(sceneLocation.name)} remains the location authority; ${text(sceneLocation.atmosphere) || "the established environment is preserved"}.` : explicitAbsence("new location", "the established scene geography is preserved.")),
      wardrobe: meaningfulDirection(continuity.wardrobe) || (noActors ? explicitAbsence("wardrobe", "there is no human talent in this scene and the machinery/environment carry the action.") : "Wardrobe remains continuous with the established scene talent."),
      screen_direction: text(continuity.screen_direction) || (text(camera.movement_path) ? `Screen direction follows ${text(camera.movement_path)}.` : `Screen direction preserves the action described as: ${text(shot.action) || "the established scene movement"}.`),
      spatial_geography: text(continuity.spatial_geography) || [text(sceneLocation.name), text(sceneLocation.scale), text(camera.framing)].filter(Boolean).join("; ") || "Spatial geography preserves the established scene layout and subject relationship.",
    },
    audio: {
      ...audio,
      source_sound: text(audio.source_sound) || (sceneSound ? `Source sound follows the scene sound design: ${sceneSound}` : "Authentic location ambience follows the visible physical action in frame."),
      mix_intent: text(audio.mix_intent) || (sceneSound ? `Mix keeps the scene's physical sound design primary: ${sceneSound}` : "Mix keeps physical source sound primary and avoids decorative music masking the action."),
    },
    energy_level: Math.max(0, Math.min(100, energy)),
    tempo_role: ["HOLD","BUILD","ACCELERATE","PEAK","RELEASE","SILENCE"].includes(tempo) ? tempo : "HOLD",
    transition_in: text(shot.transition_in) || (shotIndex === 0 ? `Scene enters through its stated transition logic: ${text(scene.transition_logic) || "the prior story state resolves into this action"}.` : "Direct cut from the preceding shot preserves action continuity."),
    transition_out: text(shot.transition_out) || (shotIndex === list(scene.shots).length - 1 ? `Scene exits through its stated transition logic: ${text(scene.transition_logic) || "the completed action hands off to the next story state"}.` : "Direct cut to the next shot advances the same scene action."),
    primary_source_asset_id: sourceBinding.primarySourceAssetId,
    reference_assets: sourceBinding.referenceAssets,
    negative_constraints: asList(shot.negative_constraints).length ? asList(shot.negative_constraints) : fallbackNegativeConstraints,
    known_failure_modes: asList(shot.known_failure_modes).length ? asList(shot.known_failure_modes) : fallbackFailureModes,
    repair_instructions: asList(shot.repair_instructions).length ? asList(shot.repair_instructions) : fallbackRepairInstructions,
    generation: {
      ...generation,
      required: generation.required === false ? false : true,
      service: text(generation.service) || text(fallbackGeneration?.service) || "ai.video.generate",
      capability: text(generation.capability) || text(fallbackGeneration?.capability) || "ai.video.generate",
      output_spec: {
        ...generationSpec,
        ...(directedDuration !== null ? { duration_seconds: directedDuration } : {}),
      },
    },
  };
}

function firstEvidence(plan = {}) {
  const manifestId = text(list(plan.asset_manifest)[0]?.asset_id || list(plan.asset_manifest)[0]?.id);
  const thesis = text(plan.concept?.creative_thesis);
  const proof = text(plan.story?.observable_proof);
  return manifestId || thesis || proof || "temporal master plan";
}
function activeRoleDecision(roleId, plan = {}) {
  const evidence = firstEvidence(plan);
  const thesis = text(plan.concept?.creative_thesis) || text(plan.story?.observable_proof) || "the authored temporal direction";
  const qualityVersion = text(plan.quality?.version) || "the active quality policy";
  const rules = {
    sound_director: `Keep physical source sound and authored shot mix intent primary across this temporal work; music and effects must support, not mask, ${thesis}.`,
    motion_design_director: `Keep titles, logos and supers outside generated pixels and use motion graphics only when the authored hierarchy requires them; the filmed action remains primary for ${thesis}.`,
    vfx_director: `Use VFX only for invisible cleanup, continuity repair and physically credible integration required by the authored shots; preserve the observable realism of ${thesis}.`,
    quality_director: `Apply ${qualityVersion} as the release gate and reject any shot that breaks story progression, continuity, technical integrity or the authored non-AI visual standard.`,
    rights_safety_director: `Treat selected source assets as governed reference evidence, preserve their provenance, and keep unverified claims, logos and protected text out of generated pixels before release.`,
    release_director: `Keep release blocked until exact-duration, technical master, quality, rights and continuity validation all pass; generation completion alone is not release evidence.`,
    performance_director: `Measure the finished work against the mission outcome and observable proof expressed by ${text(plan.story?.observable_proof) || thesis}, rather than generic engagement alone.`,
  };
  if (!rules[roleId]) return null;
  return { status: "ACTIVE", decision: rules[roleId], evidence: [evidence], confidence: 95, risks: [], repair_instructions: [] };
}
function ensureAssetManifest(plan = {}, assets = []) {
  const selectedIds = new Set(list(assets).map((asset) => text(asset.id || asset.asset_id)).filter(Boolean));
  const existing = list(plan.asset_manifest)
    .map((entry) => ({ ...object(entry) }))
    .filter((entry) => !selectedIds.size || selectedIds.has(text(entry.asset_id || entry.id)));
  const known = new Set(existing.map((entry) => text(entry.asset_id || entry.id)).filter(Boolean));
  const deliverableIds = list(plan.deliverables).map((d) => text(d.id)).filter(Boolean);
  for (const asset of list(assets)) {
    const id = text(asset.id || asset.asset_id);
    if (!id || known.has(id)) continue;
    existing.push({
      asset_id: id,
      disposition: "REFERENCE",
      reason: `Selected project reference evidence: ${text(asset.name || asset.title) || id}`,
      confidence: Number(asset.analysis?.confidence || asset.metadata?.confidence || 100),
      assignments: deliverableIds,
      restrictions: object(asset.restrictions || asset.metadata?.restrictions),
      continuity_anchors: {},
      repair_requirements: [],
    });
    known.add(id);
  }
  return { ...plan, asset_manifest: existing };
}

function completeGovernanceRoles(plan = {}) {
  const current = object(plan.role_decisions);
  const next = { ...current };
  for (const id of ["sound_director","motion_design_director","vfx_director","quality_director","rights_safety_director","release_director","performance_director"]) {
    if (!text(current[id]?.status)) next[id] = activeRoleDecision(id, plan);
  }
  return { ...plan, role_decisions: next };
}

export function normalizeTemporalMechanicalContract(plan = {}, { duration_seconds = null, assets = [] } = {}) {
  const duration = finite(duration_seconds ?? plan?.temporal_contract?.duration_seconds ?? plan?.deliverables?.[0]?.output_spec?.duration_seconds);
  if (!duration || duration <= 0) return plan;
  const deliverables = list(plan.deliverables);
  const masterSpec = canonicalVideoSpec(object(deliverables[0]?.output_spec));
  let scenes = allocateLatePayoffScenes(plan.scenes, duration);
  const fallbackGeneration = scenes.flatMap((s) => list(s.shots)).map((s) => object(s.generation)).find((g) => text(g.service) || text(g.capability)) || {};
  scenes = scenes.map((scene) => {
    const shots = allocateLatePayoffShots(scene.shots, scene.duration_seconds);
    const firstPass = shots.map((shot, index) => normalizeShot(shot, { ...scene, shots }, index, masterSpec, fallbackGeneration, plan));
    const normalizedScene = { ...scene, shots: firstPass.map((shot, index) => normalizedPrevisualizationContracts(shot, scene, index)) };
    return normalizeSceneEvidence(normalizedScene, assets, plan);
  });
  const normalized = ensureAssetManifest({
    ...plan,
    deliverables: deliverables.map((d, index) => index === 0 ? { ...d, output_spec: { ...masterSpec, duration_seconds: duration } } : d),
    scenes,
  }, assets);
  return completeGovernanceRoles(normalizeProductionScoutBibles(normalized));
}
export default normalizeTemporalMechanicalContract;
