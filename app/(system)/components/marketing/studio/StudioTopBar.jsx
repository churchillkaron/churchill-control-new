"use client";

export default function StudioTopBar({
  poster,
}) {

  return (

    <div
      className="
        h-[90px]
        border-b
        border-white/10
        flex
        items-center
        justify-between
        px-10
        backdrop-blur-xl
        bg-black/70
        sticky
        top-0
        z-50
      "
    >

      <div>

        <div
          className="
            text-3xl
            font-light
            tracking-tight
          "
        >
          Churchill AI Studio
        </div>

        <div
          className="
            text-white/40
            text-sm
            mt-1
          "
        >
          Luxury Hospitality Creative Engine
        </div>

      </div>

      <div
        className="
          flex
          items-center
          gap-4
        "
      >

        <button
          onClick={() =>
            poster.setEngine(
              "full-ai"
            )
          }
          className={`
            px-5
            py-3
            rounded-2xl
            font-semibold
            transition-all

            ${
              poster.engine ===
              "full-ai"

                ? "bg-orange-500 text-black"

                : `
                  bg-white/5
                  border
                  border-white/10
                  text-white/70
                `
            }
          `}
        >
          Full AI
        </button>

        <button
          onClick={() =>
            poster.setEngine(
              "enhance"
            )
          }
          className={`
            px-5
            py-3
            rounded-2xl
            font-semibold
            transition-all

            ${
              poster.engine ===
              "enhance"

                ? "bg-orange-500 text-black"

                : `
                  bg-white/5
                  border
                  border-white/10
                  text-white/70
                `
            }
          `}
        >
          Enhance
        </button>

        <button
          onClick={() =>
            poster.setEngine(
              "composite"
            )
          }
          className={`
            px-5
            py-3
            rounded-2xl
            font-semibold
            transition-all

            ${
              poster.engine ===
              "composite"

                ? "bg-orange-500 text-black"

                : `
                  bg-white/5
                  border
                  border-white/10
                  text-white/70
                `
            }
          `}
        >
          Composite
        </button>

        <a
          href="/api/meta/auth"
          className="
            bg-blue-600
            hover:bg-blue-500
            transition-all
            px-6
            py-3
            rounded-2xl
            font-semibold
          "
        >
          Connect Meta
        </a>

      </div>

    </div>

  );

}