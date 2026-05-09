"use client";

export default function LiveMusic({
  image,
  logo,
  title,
  subtitle,
  date,
  footer,

  titleSize,
  subtitleSize,
  logoSize,
  overlayOpacity,
  contentWidth,
  verticalPosition,
  alignment,
  logoPosition,
}) {

  return (
    <div className="
      relative
      w-full
      h-[900px]
      overflow-hidden
      rounded-3xl
      bg-black
      border
      border-white/10
    ">

      {/* IMAGE */}

      {image && (
        <img
          src={image}
          alt=""
          className="
            absolute
            inset-0
            w-full
            h-full
            object-cover
          "
        />
      )}

      {/* LIVE MUSIC OVERLAYS */}

      <div
  className="absolute inset-0 bg-black"
  style={{
    opacity: overlayOpacity / 100,
  }}
/>

      <div className="
        absolute
        inset-0
        bg-gradient-to-t
        from-black
        via-black/35
        to-black/10
      " />

      <div className="
        absolute
        inset-0
        bg-[radial-gradient(circle_at_center,rgba(255,120,0,0.12),transparent_45%)]
      " />

      <div className="
        absolute
        inset-0
        bg-[linear-gradient(to_top,rgba(0,0,0,0.85),transparent_50%)]
      " />

      {/* LOGO */}

      <div
  className={`
    absolute
    z-20

    ${
      logoPosition === "top-center"
        ? "top-10 left-1/2 -translate-x-1/2"

        : logoPosition === "top-right"
        ? "top-10 right-10"

        : logoPosition === "bottom-left"
        ? "bottom-10 left-10"

        : logoPosition === "bottom-right"
        ? "bottom-10 right-10"

        : "top-10 left-10"
    }
  `}
>

       <img
  src={logo}
  alt=""
  style={{
    width: `${logoSize}px`,
  }}
  className="
    drop-shadow-[0_0_40px_rgba(255,120,0,0.45)]
  "
/>

      </div>

      {/* LIVE TAG */}

      <div className="
        absolute
        top-10
        right-10
        z-20
      ">

        <div className="
          rounded-full
          border
          border-red-500/40
          bg-red-500/15
          backdrop-blur-md
          px-5
          py-2
          text-red-300
          uppercase
          tracking-[0.25em]
          text-xs
        ">
          Live Music
        </div>

      </div>

      {/* CONTENT */}

      <div
  className={`
    absolute
    z-20

    ${
      alignment === "center"
        ? "left-1/2 -translate-x-1/2 text-center"
        : alignment === "right"
        ? "right-14 text-right"
        : "left-14 text-left"
    }
  `}
  style={{
    bottom: `${verticalPosition}%`,
    maxWidth: `${contentWidth}%`,
  }}
>

        {/* SUBTITLE */}

<div
  style={{
    fontSize: `${subtitleSize}px`,
  }}
  className="
    uppercase
    tracking-[0.45em]
    text-orange-400
    mb-5
  "
>
  {subtitle}
</div>

{/* TITLE */}

<h1
  style={{
    fontSize: `${titleSize}px`,
  }}
  className="
    leading-[0.9]
    tracking-tight
    uppercase
    text-white
    font-light
  "
>
  {title}
</h1>

{/* DATE */}

<div className="
  mt-7
  text-white/90
  uppercase
  tracking-[0.22em]
  text-2xl
">
  {date}
</div>

{/* CTA */}

<div className="mt-10">

  <div className="
    inline-flex
    items-center
    rounded-full
    border
    border-orange-500/35
    bg-black/55
    backdrop-blur-md
    px-7
    py-3
    text-orange-300
    uppercase
    tracking-[0.18em]
    text-sm
  ">
    {footer}
  </div>

</div>

      </div>

    </div>
  );
}