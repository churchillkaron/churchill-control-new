const GENERIC_TITLE_PATTERN = /^(?:creative\s+)?(?:deliverable|output)\s*\d*$/i;

function list(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function identityText(deliverable = {}) {
  return [
    deliverable.id,
    deliverable.title,
    deliverable.name,
    deliverable.metadata?.purpose,
    deliverable.metadata?.for,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function technicalText(deliverable = {}) {
  return [
    ...list(deliverable.formats),
    ...list(deliverable.channels),
    ...list(deliverable.capabilities),
    ...list(deliverable.execution_capabilities),
    JSON.stringify(deliverable.specifications || {}),
  ]
    .join(" ")
    .toLowerCase();
}

function explicitMedium(value) {
  const medium = String(value || "").trim().toUpperCase();
  return [
    "FILM",
    "VIDEO",
    "IMAGE",
    "AUDIO",
    "MULTIMEDIA",
    "WEBSITE",
    "MENU",
    "DOCUMENT",
    "PRESENTATION",
  ].includes(medium)
    ? medium === "VIDEO" ? "FILM" : medium
    : null;
}

function identityMedium(identity = "") {
  if (
    /hero.*film|film.*hero|film[_\s-]*master|master[_\s-]*(film|video)|\bcutdowns?\b|reels?|shorts?|trailer|episode|dj.*cutdown|club.*entry/.test(identity)
  ) {
    return "FILM";
  }
  if (
    /\bstills?\b|scene.*still|still.*scene|keyframes?|master.*still|still.*pack|key.*art|image.*system|approval.*frame|bar.*flair/.test(identity)
  ) {
    return "IMAGE";
  }
  if (
    /sound.*design|sounddesign|audio.*pack|stem.*pack|music.*pack|voice.*pack/.test(identity)
  ) {
    return "AUDIO";
  }
  if (
    /typograph|brand.*endcard|endcard.*system|motion.*graphic|animated.*identity/.test(identity)
  ) {
    return "MULTIMEDIA";
  }
  if (/website|webpage|landing.*page|web.*experience/.test(identity)) return "WEBSITE";
  if (/menu/.test(identity)) return "MENU";
  if (/presentation|deck/.test(identity)) return "PRESENTATION";
  if (/document|copy.*pack|script.*pack/.test(identity)) return "DOCUMENT";
  return null;
}

export function resolveCreativeDeliverableMedium(deliverable = {}) {
  const identity = identityText(deliverable);
  const technical = technicalText(deliverable);
  const fromIdentity = identityMedium(identity);
  if (fromIdentity) return fromIdentity;

  if (
    /image_to_video|video\.generate|\bvideo\b|\bfilm\b|\b24[- ]?30fps\b|\b30fps\b|1080x1920/.test(technical)
  ) {
    return "FILM";
  }
  if (
    /\.wav|\.mp3|48khz|music\.generate|sfx\.generate/.test(technical) &&
    !/image_to_video|video\.generate|\bvideo\b|\bfilm\b/.test(technical)
  ) {
    return "AUDIO";
  }
  if (
    /png|jpe?g|keyframe|image\.generate|image\.analyze|stills?_count|minimum_resolution/.test(technical) &&
    !/image_to_video|video\.generate|\bvideo\b|\bfilm\b/.test(technical)
  ) {
    return "IMAGE";
  }

  return explicitMedium(deliverable.medium) || "MULTIMEDIA";
}

function requiredCapabilities(medium) {
  if (medium === "FILM") {
    return [
      "ai.image.generate",
      "ai.image.analyze",
      "ai.image.upscale",
      "ai.video.image_to_video",
      "ai.music.generate",
      "ai.sfx.generate",
    ];
  }
  if (medium === "IMAGE") {
    return ["ai.image.generate", "ai.image.analyze", "ai.image.upscale"];
  }
  if (medium === "AUDIO") {
    return ["ai.music.generate", "ai.sfx.generate"];
  }
  if (["MULTIMEDIA", "WEBSITE", "MENU", "DOCUMENT", "PRESENTATION"].includes(medium)) {
    return ["ai.text.generate", "ai.image.generate", "ai.image.analyze"];
  }
  return ["ai.reasoning.execute"];
}

function canonicalTitle(deliverable, medium) {
  const supplied = String(deliverable.title || deliverable.name || "").trim();
  const identity = identityText(deliverable);

  if (medium === "FILM") {
    if (/cutdown|reel|short|dj/.test(identity)) {
      return "Social Campaign Cutdown Series";
    }
    if (!supplied || GENERIC_TITLE_PATTERN.test(supplied) || /music|sound package/i.test(supplied)) {
      return "Churchill Cinematic Hero Film";
    }
  }
  if (medium === "IMAGE") {
    if (!supplied || GENERIC_TITLE_PATTERN.test(supplied) || /web experience/i.test(supplied)) {
      return "Scene Master Stills & Approval Frames";
    }
  }
  if (medium === "AUDIO") {
    if (!supplied || GENERIC_TITLE_PATTERN.test(supplied)) {
      return "Cinematic Sound Design Master Pack";
    }
  }
  if (medium === "MULTIMEDIA") {
    if (!supplied || GENERIC_TITLE_PATTERN.test(supplied)) {
      return "Motion Typography & Brand Endcard System";
    }
  }

  if (supplied && !GENERIC_TITLE_PATTERN.test(supplied)) return supplied;
  if (medium === "WEBSITE") return "Campaign Web Experience";
  if (medium === "MENU") return "Campaign Menu System";
  if (medium === "DOCUMENT") return "Campaign Copy & Release Package";
  if (medium === "PRESENTATION") return "Campaign Presentation";
  return "Creative Production Output";
}

function description(deliverable, title, medium) {
  const supplied = String(deliverable.description || "").trim();
  const wrongMedium = supplied && new RegExp(`\\bas an?\\s+(?!${medium}\\b)[A-Z]+`, "i").test(supplied);
  const wrongTitle = supplied && !supplied.toLowerCase().includes(title.toLowerCase());
  const generic = /^produce\s+(?:creative\s+)?(?:deliverable|output)\s*\d*/i.test(supplied);
  if (supplied && !wrongMedium && !wrongTitle && !generic) return supplied;

  const channels = list(deliverable.channels);
  const formats = list(deliverable.formats);
  return `Produce ${title} as a ${medium}${channels.length ? ` for ${channels.join(", ")}` : ""}${formats.length ? ` in ${formats.join(", ")}` : ""}, grounded in approved business truth and reference assets, with dedicated quality evidence and a release-ready contract.`;
}

export function enforceCreativeDeliverableContract(blueprint = {}) {
  const deliverables = Array.isArray(blueprint.deliverables)
    ? blueprint.deliverables.map((deliverable) => {
        const medium = resolveCreativeDeliverableMedium(deliverable);
        const title = canonicalTitle(deliverable, medium);
        const executionCapabilities = [
          ...new Set([
            ...list(deliverable.execution_capabilities).filter((item) => item.includes(".")),
            ...requiredCapabilities(medium),
          ]),
        ];

        return {
          ...deliverable,
          title,
          medium,
          description: description(deliverable, title, medium),
          execution_capabilities: executionCapabilities,
        };
      })
    : [];

  return {
    ...blueprint,
    deliverables,
  };
}
