"use client";

import PropertyEditor from "../properties/PropertyEditor";


function Row({
  label,
  value,
}) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-3">
      <div className="text-sm text-white/45">
        {label}
      </div>

      <div className="text-right font-medium text-white">
        {value ?? "-"}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-5 text-xs uppercase tracking-[0.25em] text-white/40">
        {title}
      </div>

      {children}
    </section>
  );
}

export default function Inspector({
  runtime,
  editor,
}) {

  const project =
    runtime.projectRuntime?.project;

  const queue =
    runtime.data.queue || {};

  const scenes =
    runtime.data.scenes || [];

  const shots =
    runtime.data.shots || [];

  const tasks =
    runtime.data.tasks || [];

  const assets =
    runtime.data.assets || [];

  return (

    <aside className="overflow-auto border-l border-white/10 bg-[#0b0f18]">

      <div className="space-y-5 p-6">

        <Section title="Project">

          <Row
            label="Name"
            value={project?.name}
          />

          <Row
            label="Status"
            value={project?.status}
          />

          <Row
            label="Budget"
            value={project?.budget_profile}
          />

          <Row
            label="Quality"
            value={project?.quality_profile}
          />

        </Section>

        <Section title="Production">

          <Row
            label="Scenes"
            value={scenes.length}
          />

          <Row
            label="Shots"
            value={shots.length}
          />

          <Row
            label="Tasks"
            value={tasks.length}
          />

          <Row
            label="Assets"
            value={assets.length}
          />

        </Section>

        <Section title="Queue">

          <Row
            label="Waiting"
            value={queue.waiting?.length || 0}
          />

          <Row
            label="Ready"
            value={queue.ready?.length || 0}
          />

          <Row
            label="Running"
            value={queue.running?.length || 0}
          />

          <Row
            label="Review"
            value={queue.review?.length || 0}
          />

          <Row
            label="Completed"
            value={queue.completed?.length || 0}
          />

        </Section>

        <Section title="AI Director">

          <div className="space-y-3 text-sm text-white/70">

            <p>
              Project intelligence will appear here.
            </p>

            <ul className="list-disc space-y-2 pl-5">

              <li>Recommend reusable assets</li>

              <li>Select best AI provider</li>

              <li>Estimate production cost</li>

              <li>Optimize render pipeline</li>

              <li>Suggest scene improvements</li>

            </ul>

          </div>

        </Section>

      

        <Section title="Selected">

          <Row
            label="Type"
            value={editor.selection?.type}
          />

          <Row
            label="Title"
            value={editor.selection?.data?.title}
          />

          <Row
            label="Status"
            value={editor.selection?.data?.status}
          />

          <Row
            label="Duration"
            value={editor.selection?.data?.duration_seconds}
          />

        </Section>

        <Section title="Editor">

          <PropertyEditor
            item={editor.selection?.data}
            onSave={editor.save}
          />

        </Section>


      </div>

    </aside>

  );

}
