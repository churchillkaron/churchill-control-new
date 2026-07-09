"use client";

function Section({
  title,
  children,
}) {
  return (
    <div className="mb-8">
      <div className="mb-3 text-[11px] uppercase tracking-[0.28em] text-white/35">
        {title}
      </div>
      {children}
    </div>
  );
}

function Project({
  runtime,
  project,
}) {

  const active =
    runtime.projectRuntime?.project?.id === project.id;

  return (

    <a
      href={`/workspace/${runtime.organizationId}/commercial/design/production/${project.id}`}
      className={[
        "mb-2 block rounded-xl border p-4",
        active
          ? "border-[#c8a96a]/30 bg-[#b48a45]/10"
          : "border-white/10 bg-white/[0.03]"
      ].join(" ")}
    >

      <div className="font-medium">
        {project.name}
      </div>

      <div className="mt-1 text-xs text-white/45">
        {project.production_type}
      </div>

      <div className="mt-4 space-y-1 border-t border-white/10 pt-3 text-sm text-white/55">

        <div>Creative Brief</div>
        <div>Strategy</div>
        <div>Storyboard</div>
        <div>Scenes</div>
        <div>Shots</div>
        <div>Tasks</div>
        <div>Assets</div>
        <div>Timeline</div>
        <div>Render</div>
        <div>Publish</div>

      </div>

    </a>

  );

}

export default function ProjectTree({
  runtime,
}) {

  const projects =
    runtime.projectRuntime?.projects || [];

  return (

    <Section title="Creative Projects">

      {projects.map(project => (

        <Project
          key={project.id}
          runtime={runtime}
          project={project}
        />

      ))}

    </Section>

  );

}
