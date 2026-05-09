"use client";

export default function TemplateName({
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

      {/* FOOD OVERLAYS */}

      <div className="
        absolute
        inset-0
        bg-gradient-to-t
        from-black/80
        via-black/25
        to-black/10
      " />

      <div className="
        absolute
        inset-0
        bg-[radial-gradient(circle_at_bottom,rgba(255,140,0,0.08),transparent_45%)]
      " />

      {/* TOP BAR */}

      <div className="
        absolute
        top-0
        left-0
        right-0
        h-36
        bg-gradient-to-b
        from-black/70
        to-transparent
        z-10
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
    drop-shadow-[0_0_35px_rgba(255,120,0,0.45)]
  "
/>

      </div>

      {/* FOOD TAG */}

      <div className="
        absolute
        top-10
        right-10
        z-20
      ">

        <div className="
          rounded-full
          border
          border-orange-500/30
          bg-black/45
          backdrop-blur-md
          px-5
          py-2
          text-orange-300
          uppercase
          tracking-[0.25em]
          text-xs
        ">
          Signature Dining
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
          mt-6
          text-white/90
          uppercase
          tracking-[0.18em]
          text-xl
        ">
          {date}
        </div>

        {/* CTA */}

        <div className="mt-8">

          <div className="
            inline-flex
            items-center
            rounded-full
            border
            border-orange-500/30
            bg-black/45
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