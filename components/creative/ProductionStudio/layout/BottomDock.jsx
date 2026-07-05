"use client";

import AssetBrowser from "../assets/AssetBrowser";
import TimelinePanel from "../timeline/TimelinePanel";


function QueueColumn({
  title,
  items = [],
}) {

  return (

    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">

      <div className="mb-4 flex items-center justify-between">

        <div className="text-xs uppercase tracking-[0.22em] text-white/40">
          {title}
        </div>

        <div className="rounded-full bg-white/10 px-2 py-1 text-xs">
          {items.length}
        </div>

      </div>

      <div className="space-y-2">

        {items.map(task => (

          <div
            key={task.id}
            className="rounded-xl border border-white/10 bg-black/20 p-3"
          >

            <div className="font-medium">
              {task.title}
            </div>

            <div className="mt-1 text-xs text-white/45">
              {task.type}
            </div>

          </div>

        ))}

        {!items.length && (

          <div className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-white/35">

            Empty

          </div>

        )}

      </div>

    </div>

  );

}

function KPI({
  title,
  value,
}) {

  return (

    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">

      <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">
        {title}
      </div>

      <div className="mt-2 text-2xl font-semibold">
        {value}
      </div>

    </div>

  );

}

export default function BottomDock({
  runtime,
}) {

  const queue =
    runtime.data.queue || {};

  const tasks =
    runtime.data.tasks || [];

  const assets =
    runtime.data.assets || [];

  return (

    <footer className="h-80 border-t border-white/10 bg-[#0d111b]">

      <div className="grid h-full grid-cols-[2fr_380px_380px] gap-5 p-5">

        <div className="flex gap-4 overflow-x-auto">

          <QueueColumn
            title="Waiting"
            items={queue.waiting}
          />

          <QueueColumn
            title="Ready"
            items={queue.ready}
          />

          <QueueColumn
            title="Running"
            items={queue.running}
          />

          <QueueColumn
            title="Review"
            items={queue.review}
          />

          <QueueColumn
            title="Completed"
            items={queue.completed}
          />

        </div>

        <div>

          <div className="mb-4 text-xs uppercase tracking-[0.22em] text-white/40">
            Timeline
          </div>

          <TimelinePanel
            runtime={runtime}
          />

          <div className="mt-6 mb-4 text-xs uppercase tracking-[0.22em] text-white/40">
            Production
          </div>

          <div className="grid grid-cols-2 gap-3">

            <KPI
              title="Tasks"
              value={tasks.length}
            />

            <KPI
              title="Assets"
              value={assets.length}
            />

            <KPI
              title="Running"
              value={queue.running?.length || 0}
            />

            <KPI
              title="Completed"
              value={queue.completed?.length || 0}
            />

            <KPI
              title="Waiting"
              value={queue.waiting?.length || 0}
            />

            <KPI
              title="Review"
              value={queue.review?.length || 0}
            />

          </div>

        </div>

        <div>

          <div className="mb-4 text-xs uppercase tracking-[0.22em] text-white/40">
            Assets
          </div>

          <AssetBrowser
            runtime={runtime}
          />

          <div className="mt-6 mb-4 text-xs uppercase tracking-[0.22em] text-white/40">
            AI Director
          </div>

          <div className="space-y-3">

            <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-4">
              Optimize production sequence
            </div>

            <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-4">
              Reuse existing assets
            </div>

            <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-4">
              Select lowest-cost AI provider
            </div>

            <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-4">
              Estimate rendering cost
            </div>

            <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-4">
              Ready for publishing
            </div>

          </div>

        </div>

      </div>

    </footer>

  );

}
