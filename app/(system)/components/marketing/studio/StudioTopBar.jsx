"use client";

export default function StudioTopBar({
  poster,
}) {

  const engines = [

    {
      id: "full-ai",
      label: "Full AI",
    },

    {
      id: "enhance",
      label: "Enhance",
    },

    {
      id: "composite",
      label: "Composite",
    },

    {
      id: "video",
      label: "Video",
    },

  ];

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

      {/* LEFT */}

      <div>

        <div
          className="
            text-3xl
            font-light
            tracking-tight
          "
        >
          Avantiqo Design Studio
        </div>

        <div
          className="
            text-white/40
            text-sm
            mt-1
          "
        >
          Creative Operating System
        </div>

      </div>

      {/* RIGHT */}

      <div
        className="
          flex
          items-center
          gap-4
        "
      >

        {/* ENGINES */}

        <div
          className="
            flex
            items-center
            gap-3
          "
        >

          {engines.map(
            (engine) => (

              <button

                key={engine.id}

                onClick={() =>

                  poster.setEngine(
                    engine.id
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
                    engine.id

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

                {engine.label}

              </button>

            )
          )}

        </div>

        {/* META */}

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