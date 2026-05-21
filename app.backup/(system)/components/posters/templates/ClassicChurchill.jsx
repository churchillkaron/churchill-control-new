"use client";

export default function ClassicChurchill({
  posterRef,
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

  fontFamily,
  colorTheme,
  logoPosition,
}) {

  return (

    <div
      ref={posterRef}
      className="
        relative
        w-full
        h-[900px]
        overflow-hidden
        rounded-3xl
        bg-black
        border
        border-white/10
      "
    >

      {/* BACKGROUND IMAGE */}

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

      {/* SIMPLE OVERLAY */}

      <div
        className="absolute inset-0 bg-black"
        style={{
          opacity: overlayOpacity / 100,
        }}
      />

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
          alt="Churchill"
          style={{
            width: `${logoSize}px`,
          }}
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
            color: colorTheme.primary,
            fontFamily,
          }}
          className="
            uppercase
            tracking-[0.45em]
            mb-5
          "
        >
          {subtitle}
        </div>

        {/* TITLE */}

        <h1
          style={{
            fontSize: `${titleSize}px`,
            fontFamily,
          }}
          className="
            leading-none
            tracking-tight
            uppercase
            font-light
            text-white
          "
        >
          {title}
        </h1>

        {/* DATE */}

        <div
          className="
            mt-5
            text-2xl
            text-white/90
            tracking-[0.18em]
            uppercase
            font-light
          "
        >
          {date}
        </div>

        {/* CTA */}

        <div
          style={{
            borderColor: `${colorTheme.primary}70`,
            color: colorTheme.primary,
          }}
          className="
            inline-flex
            items-center
            border
            bg-black/45
            rounded-full
            px-6
            py-3
            text-sm
            tracking-[0.18em]
            uppercase
          "
        >
          {footer}
        </div>

      </div>

    </div>

  );
}