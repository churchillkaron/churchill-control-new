"use client";

const fonts = [
  "Cinzel",
  "Playfair Display",
  "Cormorant Garamond",
  "Bodoni Moda",
  "Montserrat",
];

export default function FontSelector({
  fontFamily,
  setFontFamily,
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
          Typography
        </h2>

        <p className="text-white/40 text-sm mt-1">
          Brand font system
        </p>

      </div>

      <div className="space-y-3">

        {fonts.map((font) => (

          <button
            key={font}
            onClick={() => setFontFamily(font)}
            style={{
              fontFamily: font,
            }}
            className={`
              w-full
              text-left
              px-5
              py-4
              rounded-2xl
              border
              transition-all

              ${
                fontFamily === font
                  ? "bg-orange-500 text-black border-orange-500"
                  : "border-white/10 text-white hover:bg-white/5"
              }
            `}
          >
            {font}
          </button>

        ))}

      </div>

    </div>
  );
}