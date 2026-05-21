"use client";

const themes = [

  {
    name: "Churchill Orange",
    primary: "#ff7a00",
  },

  {
    name: "Gold Luxury",
    primary: "#d4af37",
  },

  {
    name: "White Minimal",
    primary: "#ffffff",
  },

  {
    name: "Red Jazz",
    primary: "#ff3b30",
  },

  {
    name: "Blue Lounge",
    primary: "#3b82f6",
  },

  {
    name: "Emerald Cocktail",
    primary: "#10b981",
  },

];

export default function ColorThemeSelector({
  colorTheme,
  setColorTheme,
}) {

  return (

    <div className="
      bg-white/[0.03]
      border
      border-white/10
      rounded-2xl
      p-6
      space-y-5
    ">

      <div>

        <h2 className="text-2xl">
          Color Theme
        </h2>

        <p className="text-white/40 text-sm mt-1">
          Campaign mood system
        </p>

      </div>

      <div className="grid grid-cols-2 gap-4">

        {themes.map((theme) => (

          <button
            key={theme.name}
            onClick={() => setColorTheme(theme)}
            className={`
              rounded-2xl
              border
              p-5
              text-left
              transition-all

              ${
                colorTheme.name === theme.name
                  ? "border-white"
                  : "border-white/10"
              }
            `}
            style={{
              background: `${theme.primary}20`,
            }}
          >

            <div
              className="
                w-10
                h-10
                rounded-full
                mb-4
              "
              style={{
                background: theme.primary,
              }}
            />

            <div className="text-sm">
              {theme.name}
            </div>

          </button>

        ))}

      </div>

    </div>
  );
}