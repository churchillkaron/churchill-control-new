"use client";

export default function EngineDecisionRoom({
  setEngine,
  next,
}) {
  const ENGINES = [
    {
      id: "full-ai",
      title: "AI Generates Everything",
      image: "/ai/full-ai.jpg",
      description:
        "AI creates the full Hollywood poster from scratch including crowd, atmosphere, typography and Churchill branding.",
    },

    {
      id: "upload-subject",
      title: "Upload Singer / Food / Drinks",
      image: "/ai/subject.jpg",
      description:
        "Preserve uploaded subject and build cinematic movie-poster artwork around it.",
    },

    {
      id: "upload-venue",
      title: "Upload Venue / Dining / Bar",
      image: "/ai/venue.jpg",
      description:
        "Use real Churchill venue photos and let AI create cinematic atmosphere.",
    },

    {
      id: "hybrid",
      title: "Hybrid AI Mode",
      image: "/ai/hybrid.jpg",
      description:
        "Upload anything and let AI complete the cinematic world.",
    },

    {
      id: "manual",
      title: "Full Manual Studio",
      image: "/ai/manual.jpg",
      description:
        "Manual typography, logo and layout control.",
    },
  ];

  return (
    <div>
      <div className="mb-14">
        <h1 className="text-6xl font-light mb-4">
          What do you want to create?
        </h1>

        <p className="text-white/50 text-xl">
          Choose your Hollywood AI engine
        </p>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-6">

        {ENGINES.map((engine) => (
          <button
            key={engine.id}
            onClick={() => {
              setEngine(engine.id);
              next();
            }}
            className="
              group
              bg-white/[0.03]
              border
              border-white/10
              rounded-3xl
              overflow-hidden
              text-left
              hover:border-orange-500
              hover:bg-orange-500/5
              transition-all
            "
          >
            <div className="aspect-[4/5] overflow-hidden">
              <img
                src={engine.image}
                className="
                  w-full
                  h-full
                  object-cover
                  group-hover:scale-105
                  transition-all
                  duration-700
                "
              />
            </div>

            <div className="p-6">
              <h2 className="text-2xl mb-3">
                {engine.title}
              </h2>

              <p className="text-white/50 text-sm leading-relaxed">
                {engine.description}
              </p>
            </div>
          </button>
        ))}

      </div>
    </div>
  );
}