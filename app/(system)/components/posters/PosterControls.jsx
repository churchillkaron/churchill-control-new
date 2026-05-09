"use client";

export default function PosterControls({

  
  titleSize,
  setTitleSize,

  subtitleSize,
  setSubtitleSize,

  logoSize,
  setLogoSize,

  overlayOpacity,
  setOverlayOpacity,

  contentWidth,
  setContentWidth,

  verticalPosition,
  setVerticalPosition,

  alignment,
  setAlignment,

  logoPosition,
  setLogoPosition,

}) {

  return (

    <div className="
      bg-white/[0.03]
      border
      border-white/10
      rounded-2xl
      p-6
      space-y-7
    ">

      <h2 className="text-3xl">
        Poster Controls
      </h2>

      {/* TITLE SIZE */}

      <Slider
        label="Title Size"
        value={titleSize}
        setValue={setTitleSize}
        min={40}
        max={140}
      />

      {/* SUBTITLE SIZE */}

      <Slider
        label="Subtitle Size"
        value={subtitleSize}
        setValue={setSubtitleSize}
        min={10}
        max={40}
      />

      {/* LOGO SIZE */}

      <Slider
        label="Logo Size"
        value={logoSize}
        setValue={setLogoSize}
        min={80}
        max={300}
      />

      {/* OVERLAY */}

      <Slider
        label="Overlay Darkness"
        value={overlayOpacity}
        setValue={setOverlayOpacity}
        min={0}
        max={90}
      />

      {/* CONTENT WIDTH */}

      <Slider
        label="Content Width"
        value={contentWidth}
        setValue={setContentWidth}
        min={30}
        max={90}
      />

      {/* VERTICAL POSITION */}

      <Slider
        label="Vertical Position"
        value={verticalPosition}
        setValue={setVerticalPosition}
        min={0}
        max={80}
      />

      {/* ALIGNMENT */}
{/* LOGO POSITION */}

<div>

  <div className="
    text-sm
    text-white/50
    mb-3
  ">
    Logo Position
  </div>

  <div className="flex flex-wrap gap-3">

    {[
      "top-left",
      "top-center",
      "top-right",
      "bottom-left",
      "bottom-right",
    ].map((p) => (

      <button
        key={p}
        onClick={() => setLogoPosition(p)}
        className={`
          px-4
          py-3
          rounded-xl
          border
          transition-all

          ${
            logoPosition === p
              ? "bg-orange-500 text-black border-orange-500"
              : "border-white/10 text-white/60"
          }
        `}
      >
        {p}
      </button>

    ))}

  </div>

</div>
      <div>

        <div className="
          text-sm
          text-white/50
          mb-3
        ">
          Alignment
        </div>

        <div className="flex gap-3">

          {["left", "center", "right"].map((a) => (

            <button
              key={a}
              onClick={() => setAlignment(a)}
              className={`
                px-5
                py-3
                rounded-xl
                border
                transition-all

                ${
                  alignment === a
                    ? "bg-orange-500 text-black border-orange-500"
                    : "border-white/10 text-white/60"
                }
              `}
            >
              {a}
            </button>

          ))}

        </div>

      </div>

    </div>
  );
}

function Slider({
  label,
  value,
  setValue,
  min,
  max,
}) {

  return (

    <div>

      <div className="
        flex
        justify-between
        text-sm
        text-white/50
        mb-2
      ">

        <span>{label}</span>

        <span>{value}</span>

      </div>

      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) =>
          setValue(Number(e.target.value))
        }
        className="w-full"
      />

    </div>
  );
}