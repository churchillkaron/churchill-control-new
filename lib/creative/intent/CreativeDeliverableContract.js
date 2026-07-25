const GENERIC_TITLE_PATTERN = /^(?:creative\s+)?(?:deliverable|output|asset|project)\s*\d*$/i;

const MEDIUM_ALIASES = new Map([
  ["VIDEO", "FILM"],
  ["MOVIE", "FILM"],
  ["TRAILER", "FILM"],
  ["REEL", "FILM"],
  ["PHOTO", "IMAGE"],
  ["POSTER", "IMAGE"],
  ["BANNER", "IMAGE"],
  ["STILL", "IMAGE"],
  ["WEBPAGE", "WEBSITE"],
  ["LANDING_PAGE", "WEBSITE"],
  ["WEB_ASSET", "WEBSITE"],
  ["DECK", "PRESENTATION"],
  ["COPY", "DOCUMENT"],
  ["SCRIPT", "DOCUMENT"],
  ["MUSIC", "AUDIO"],
  ["VOICE", "AUDIO"],
  ["SOUND", "AUDIO"],
  ["MOTION_GRAPHICS", "MULTIMEDIA"],
]);

const SUPPORTED_MEDIA = new Set([
  "FILM",
  "IMAGE",
  "AUDIO",
  "MULTIMEDIA",
  "WEBSITE",
  "MENU",
  "DOCUMENT",
  "PRESENTATION",
]);

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
    deliverable.form,
    deliverable.production_type,
    deliverable.metadata?.purpose,
    deliverable.metadata?.for,
    deliverable.specifications?.purpose,
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
  const supplied = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  const normalized = MEDIUM_ALIASES.get(supplied) || supplied;
  return SUPPORTED_MEDIA.has(normalized) ? normalized : null;
}

function mediumFromIdentity(identity = "") {
  if (/\b(film|video|movie|trailer|reel|cutdown|episode|commercial)\b/.test(identity)) {
    return "FILM";
  }
  if (/\b(image|photo|poster|banner|key\s*art|still|keyframe|visual)\b/.test(identity)) {
    return "IMAGE";
  }
  if (/\b(audio|music|voice|sound|sfx|foley|stem)\b/.test(identity)) {
    return "AUDIO";
  }
  if (/\b(website|webpage|landing\s*page|web\s*experience|site)\b/.test(identity)) {
    return "WEBSITE";
  }
  if (/\bmenu\b/.test(identity)) return "MENU";
  if (/\b(presentation|deck|slides?)\b/.test(identity)) return "PRESENTATION";
  if (/\b(document|copy|script|article|report|brochure|press\s*release)\b/.test(identity)) {
    return "DOCUMENT";
  }
  if (/\b(multimedia|motion\s*graphic|animation|animated\s*identity|endcard|typography)\b/.test(identity)) {
    return "MULTIMEDIA";
  }
  return null;
}

export function resolveCreativeDeliverableMedium(deliverable = {}) {
  const explicit =
    explicitMedium(deliverable.medium) ||
    explicitMedium(deliverable.production_type) ||
    explicitMedium(deliverable.form);
  if (explicit) return explicit;

  const identity = identityText(deliverable);
  const technical = technicalText(deliverable);
  const inferred = mediumFromIdentity(`${identity} ${technical}`);
  if (inferred) return inferred;

  if (/image_to_video|video\.generate|video\/|\.mp4|\.mov|\bfps\b/.test(technical)) {
    return "FILM";
  }
  if (/image\.generate|image\/|\.png|\.jpe?g|\.webp/.test(technical)) {
    return "IMAGE";
  }
  if (/music\.generate|voice\.generate|sfx\.generate|audio\/|\.wav|\.mp3/.test(technical)) {
    return "AUDIO";
  }
  if (/text\.generate|html|css|javascript|responsive/.test(technical)) {
    return "WEBSITE";
  }

  return "MULTIMEDIA";
}

function audioCapabilities(deliverable = {}) {
  const fingerprint = `${identityText(deliverable)} ${technicalText(deliverable)}`;
  const capabilities = [];
  if (/voice|speech|narrat|dialogue/.test(fingerprint)) {
    capabilities.push("ai.voice.generate");
  }
  if (/music|song|score|jingle|stem/.test(fingerprint)) {
    capabilities.push("ai.music.generate");
  }
  if (/sfx|sound\s*effect|foley|ambience|sound\s*design/.test(fingerprint)) {
    capabilities.push("ai.sfx.generate");
  }
  return capabilities.length ? capabilities : ["ai.music.generate"];
}

function requiredCapabilities(medium, deliverable = {}) {
  switch (medium) {
    case "FILM":
      return [
        "ai.image.generate",
        "ai.image.analyze",
        "ai.image.upscale",
        "ai.video.image_to_video",
        "ai.music.generate",
        "ai.sfx.generate",
      ];
    case "IMAGE":
      return ["ai.image.generate", "ai.image.analyze", "ai.image.upscale"];
    case "AUDIO":
      return audioCapabilities(deliverable);
    case "WEBSITE":
      return ["ai.text.generate", "ai.image.generate", "ai.image.analyze"];
    case "MENU":
      return ["ai.text.generate", "ai.image.generate", "ai.image.analyze"];
    case "PRESENTATION":
      return ["ai.text.generate", "ai.image.generate", "ai.image.analyze"];
    case "DOCUMENT":
      return ["ai.text.generate"];
    case "MULTIMEDIA":
      return ["ai.text.generate", "ai.image.generate", "ai.image.analyze"];
    default:
      return ["ai.reasoning.execute"];
  }
}

function canonicalTitle(deliverable, medium) {
  const supplied = String(deliverable.title || deliverable.name || "").trim();
  if (supplied && !GENERIC_TITLE_PATTERN.test(supplied)) return supplied;

  const defaults = {
    FILM: "Master Film",
    IMAGE: "Image Production",
    AUDIO: "Audio Production",
    MULTIMEDIA: "Multimedia Production",
    WEBSITE: "Web Experience",
    MENU: "Menu System",
    DOCUMENT: "Document Package",
    PRESENTATION: "Presentation",
  };

  return defaults[medium] || "Creative Production Output";
}

function description(deliverable, title, medium) {
  const supplied = String(deliverable.description || "").trim();
  const generic = /^produce\s+(?:creative\s+)?(?:deliverable|output|asset)\s*\d*/i.test(supplied);
  if (supplied && !generic) return supplied;

  const channels = list(deliverable.channels);
  const formats = list(deliverable.formats);
  return [
    `Produce ${title} as a ${medium}`,
    channels.length ? `for ${channels.join(", ")}` : null,
    formats.length ? `in ${formats.join(", ")}` : null,
    "grounded in approved business truth and reference evidence, with a deliverable-specific quality and release contract.",
  ]
    .filter(Boolean)
    .join(" ");
}

function successCriteria(deliverable, medium) {
  const supplied = list(deliverable.success_criteria);
  if (supplied.length) return supplied;

  const universal = [
    "The output satisfies the approved brief, business truth, brand rules, technical format, and channel requirements.",
    "The complete deliverable passes medium-specific quality review and retains traceable production evidence before release.",
  ];

  if (medium === "FILM") {
    return [
      "Every planned scene and shot is present at its intended duration with coherent continuity and no identity drift.",
      "Picture, sound, typography, channel variants, and the complete timeline pass full-output quality review before release.",
    ];
  }
  if (medium === "WEBSITE") {
    return [
      "The complete responsive experience includes working content structure, interaction states, accessibility, performance, and release-ready files.",
      ...universal,
    ];
  }
  return universal;
}

export function enforceCreativeDeliverableContract(blueprint = {}) {
  const deliverables = Array.isArray(blueprint.deliverables)
    ? blueprint.deliverables.map((deliverable, index) => {
        const medium = resolveCreativeDeliverableMedium(deliverable);
        const title = canonicalTitle(deliverable, medium);
        const executionCapabilities = [
          ...new Set([
            ...list(deliverable.execution_capabilities).filter((item) => item.includes(".")),
            ...requiredCapabilities(medium, deliverable),
          ]),
        ];

        return {
          ...deliverable,
          id: String(deliverable.id || `deliverable_${index + 1}`),
          title,
          medium,
          description: description(deliverable, title, medium),
          formats: list(deliverable.formats),
          channels: list(deliverable.channels),
          capabilities: list(deliverable.capabilities),
          execution_capabilities: executionCapabilities,
          dependencies: list(deliverable.dependencies),
          success_criteria: successCriteria(deliverable, medium),
          specifications:
            deliverable.specifications && typeof deliverable.specifications === "object"
              ? deliverable.specifications
              : {},
          metadata:
            deliverable.metadata && typeof deliverable.metadata === "object"
              ? deliverable.metadata
              : {},
        };
      })
    : [];

  return {
    ...blueprint,
    deliverables,
  };
}
