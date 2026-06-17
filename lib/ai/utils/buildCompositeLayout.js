export function buildCompositeLayout({

  poster,

  assets = [],

}) {

  const isVertical =

    poster?.layout ===
    "Story";

  const hasPerformer =

    assets.some(

      (a) =>

        a.asset_type ===
        "staff"

    );

  const hasCocktail =

    assets.some(

      (a) =>

        a.asset_type ===
        "cocktail"

    );

  const hasFood =

    assets.some(

      (a) =>

        a.asset_type ===
        "food"

    );

  const hasVenue =

    assets.some(

      (a) =>

        a.asset_type ===
        "venue"

    );

  return {

    canvas: {

      orientation:

        isVertical
          ? "vertical"
          : "horizontal",

      safeZone: {

        top: "10%",

        bottom: "18%",

        left: "8%",

        right: "8%",

      },

    },

    composition: {

      background:

        hasVenue
          ? "venue"
          : "cinematic-gradient",

      subject:

        hasPerformer
          ? "performer"
          : hasFood
            ? "food"
            : hasCocktail
              ? "cocktail"
              : "atmosphere",

      foregroundFX: [

        "bokeh",

        "cinematic haze",

        "light glow",

      ],

    },

    typography: {

      placement:

        isVertical
          ? "bottom"
          : "left",

      titleSize:

        isVertical
          ? "large"
          : "medium",

      subtitleSize:
        "small",

      alignment:

        isVertical
          ? "center"
          : "left",

    },

    export: {

      format:
        isVertical
          ? "story"
          : "feed",

      platform:
        "instagram",

    },

  };

}