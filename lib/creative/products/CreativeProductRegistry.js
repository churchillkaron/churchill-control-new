const SHARED = {
  mission: {
    id: "mission",
    title: "Mission",
    stage: "MISSION_CREATED",
  },
  brief: {
    id: "brief",
    title: "Brief",
    stage: "UNDERSTANDING",
  },
  research: {
    id: "research",
    title: "Research",
    stage: "RESEARCHING",
  },
  strategy: {
    id: "strategy",
    title: "Strategy",
    stage: "BUILDING_STRATEGY",
  },
  concept: {
    id: "concept",
    title: "Concept",
    stage: "BUILDING_CONCEPT",
  },
  assets: {
    id: "assets",
    title: "Assets",
    stage: "PREPARING_ASSETS",
  },
  publishing: {
    id: "publishing",
    title: "Publishing",
    stage: "PUBLISHING",
  },
  learning: {
    id: "learning",
    title: "Learning",
    stage: "LEARNING",
  },
};

function steps(...values) {
  return values.map((value) => (
    typeof value === "string"
      ? SHARED[value] || { id: value, title: value }
      : value
  ));
}

export const CREATIVE_PRODUCT_REGISTRY = {
  FILM: {
    id: "FILM",
    title: "Film",
    artifact_family: "VIDEO",
    workflow: steps(
      "mission",
      "brief",
      "research",
      "strategy",
      "concept",
      {
        id: "storyboard",
        title: "Storyboard",
        stage: "BUILDING_STORYBOARD",
      },
      "assets",
      {
        id: "production",
        title: "Production",
        stage: "PRODUCING",
      },
      {
        id: "timeline",
        title: "Timeline",
        stage: "EDITING",
      },
      {
        id: "render",
        title: "Finish",
        stage: "RENDERING",
      },
      "publishing",
      "learning",
    ),
    quality_profile: "FILM_PRODUCTION",
    editor: "FILM_STUDIO",
  },

  IMAGE: {
    id: "IMAGE",
    title: "Image",
    artifact_family: "IMAGE",
    workflow: steps(
      "mission",
      "brief",
      "research",
      "strategy",
      "concept",
      "assets",
      {
        id: "production",
        title: "Create",
        stage: "PRODUCING",
      },
      {
        id: "render",
        title: "Finish",
        stage: "RENDERING",
      },
      "publishing",
      "learning",
    ),
    quality_profile: "COMMERCIAL_IMAGE",
    editor: "IMAGE_STUDIO",
  },

  BANNER_SET: {
    id: "BANNER_SET",
    title: "Banner Set",
    artifact_family: "DESIGN",
    workflow: steps(
      "mission",
      "brief",
      "research",
      "strategy",
      "concept",
      "assets",
      {
        id: "production",
        title: "Artboards",
        stage: "PRODUCING",
      },
      {
        id: "render",
        title: "Variants",
        stage: "RENDERING",
      },
      "publishing",
      "learning",
    ),
    quality_profile: "MULTI_SIZE_DESIGN",
    editor: "ARTBOARD_STUDIO",
  },

  MENU: {
    id: "MENU",
    title: "Menu",
    artifact_family: "DOCUMENT",
    workflow: steps(
      "mission",
      "brief",
      "research",
      "strategy",
      "assets",
      {
        id: "concept",
        title: "Structure & Style",
        stage: "BUILDING_CONCEPT",
      },
      {
        id: "production",
        title: "Layout",
        stage: "PRODUCING",
      },
      {
        id: "documents",
        title: "Proof",
        stage: "QUALITY",
      },
      {
        id: "render",
        title: "Export",
        stage: "RENDERING",
      },
      "publishing",
      "learning",
    ),
    quality_profile: "MENU_AND_PRINT",
    editor: "DOCUMENT_STUDIO",
  },

  WEBPAGE: {
    id: "WEBPAGE",
    title: "Webpage",
    artifact_family: "WEB",
    workflow: steps(
      "mission",
      "brief",
      "research",
      "strategy",
      {
        id: "concept",
        title: "Information Architecture",
        stage: "BUILDING_CONCEPT",
      },
      "assets",
      {
        id: "storyboard",
        title: "Wireframe",
        stage: "BUILDING_STORYBOARD",
      },
      {
        id: "production",
        title: "Design & Build",
        stage: "PRODUCING",
      },
      {
        id: "documents",
        title: "Content & SEO",
        stage: "QUALITY",
      },
      {
        id: "render",
        title: "Responsive QA",
        stage: "RENDERING",
      },
      "publishing",
      "learning",
    ),
    quality_profile: "RESPONSIVE_WEB",
    editor: "WEB_BUILDER",
  },

  WEBSITE: {
    id: "WEBSITE",
    title: "Website",
    artifact_family: "WEB",
    workflow: steps(
      "mission",
      "brief",
      "research",
      "strategy",
      {
        id: "concept",
        title: "Site Architecture",
        stage: "BUILDING_CONCEPT",
      },
      "assets",
      {
        id: "storyboard",
        title: "Pages & Wireframes",
        stage: "BUILDING_STORYBOARD",
      },
      {
        id: "production",
        title: "Design System & Build",
        stage: "PRODUCING",
      },
      {
        id: "documents",
        title: "Content, SEO & Data",
        stage: "QUALITY",
      },
      {
        id: "render",
        title: "Responsive QA",
        stage: "RENDERING",
      },
      "publishing",
      "learning",
    ),
    quality_profile: "WEBSITE_PRODUCTION",
    editor: "WEB_BUILDER",
  },
};

const ALIASES = {
  VIDEO: "FILM",
  MASTER_VIDEO: "FILM",
  SOCIAL_VIDEO: "FILM",
  PHOTO: "IMAGE",
  IMAGE_SET: "IMAGE",
  BANNER: "BANNER_SET",
  LANDING_PAGE: "WEBPAGE",
  WEB: "WEBPAGE",
};

export function resolveCreativeProductDefinition(value = "FILM") {
  const normalized = String(value || "FILM").trim().toUpperCase();
  const id = ALIASES[normalized] || normalized;

  return (
    CREATIVE_PRODUCT_REGISTRY[id] ||
    CREATIVE_PRODUCT_REGISTRY.FILM
  );
}
