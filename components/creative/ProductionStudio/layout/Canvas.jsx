"use client";

import WorkspaceCanvasRouter from "./WorkspaceCanvasRouter";

export default function Canvas({
  runtime,
  editor,
}) {
  return (
    <section className="flex h-full min-h-0 flex-col bg-[#050505]">

      <div className="border-b border-white/10 px-6 py-4">

        <div className="flex items-center justify-between">

          <div>

            <div className="text-xs uppercase tracking-[0.30em] text-[#c8a96a]">
              {runtime.workspace?.title}
            </div>

            <div className="mt-2 text-2xl font-semibold">
              {runtime.missionRuntime?.current?.business_goal ||
                runtime.missionRuntime?.current?.title ||
                runtime.missionRuntime?.current?.name ||
                "No Mission Selected"}
            </div>

          </div>

        </div>

      </div>

      <div className="min-h-0 flex-1 overflow-auto">

        <WorkspaceCanvasRouter
          runtime={runtime}
          editor={editor}
        />

      </div>

    </section>
  );
}
