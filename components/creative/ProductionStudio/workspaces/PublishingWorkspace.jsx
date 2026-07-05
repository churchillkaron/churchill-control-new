"use client";

export default function PublishingWorkspace({
  runtime,
  editor,
}) {

  return (

    <div
      className="
        flex
        h-full
        items-center
        justify-center
        rounded-2xl
        border
        border-white/10
        bg-white/[0.03]
      "
    >

      <div className="text-center">

        <div
          className="
            text-xs
            uppercase
            tracking-[0.30em]
            text-cyan-300
          "
        >
          Creative Studio
        </div>

        <h2
          className="
            mt-4
            text-3xl
            font-semibold
          "
        >
          PublishingWorkspace
        </h2>

        <p
          className="
            mt-3
            text-white/50
          "
        >
          Workspace ready.
        </p>

      </div>

    </div>

  );

}
