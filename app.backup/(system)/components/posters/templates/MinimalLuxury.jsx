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
    <div className="relative w-full h-[900px] overflow-hidden rounded-3xl bg-black border border-white/10">

      {/* IMAGE */}

      {image && (
        <img
          src={image}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* OVERLAY */}

      <div
  className="absolute inset-0 bg-black"
  style={{
    opacity: overlayOpacity / 100,
  }}
/>

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />

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
          text-white/85
          tracking-[0.22em]
          uppercase
          text-xl
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
            border-white/15
            bg-black/40
            backdrop-blur-md
            px-7
            py-3
            text-white/90
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