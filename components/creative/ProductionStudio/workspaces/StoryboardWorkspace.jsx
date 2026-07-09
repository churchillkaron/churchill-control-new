"use client";

export default function StoryboardWorkspace({
  runtime,
}) {

  const storyboard =
    runtime.storyboardRuntime?.current;

  if (!storyboard) {

    return (
      <div className="h-full overflow-auto p-8">
        <div className="text-white/40">
          No storyboard has been created yet.
        </div>
      </div>
    );

  }

  return (

    <div className="h-full overflow-auto p-8">

      <div className="mb-8">

        <div className="text-xs uppercase tracking-[0.30em] text-[#c8a96a]">
          Storyboard
        </div>

        <div className="mt-2 text-3xl font-semibold">
          {storyboard.title || "Storyboard"}
        </div>

        <div className="mt-2 text-white/50">
          {storyboard.synopsis}
        </div>

      </div>

      <div className="grid grid-cols-4 gap-4">

        {(storyboard.scenes || []).map((scene, index) => (

          <div
            key={scene.id || index}
            className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
          >

            <div className="text-xs uppercase tracking-[0.22em] text-[#c8a96a]">
              Scene {index + 1}
            </div>

            <div className="mt-2 font-semibold">
              {scene.title}
            </div>

            <div className="mt-3 text-sm text-white/60">
              {scene.description}
            </div>

            <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-6 text-center text-xs text-white/35">
              Preview
            </div>

          </div>

        ))}

      </div>

    </div>

  );

}
