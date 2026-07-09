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

      <div className="font-medium">
        {value ?? "-"}
      </div>

    </div>
  );
}

function Card({
  title,
  children,
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">

      <div className="mb-5 text-[11px] uppercase tracking-[0.26em] text-[#c8a96a]">
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

  const selection =
    editor.selection?.data || {};

  return (
    <div className="h-full overflow-y-auto p-5 space-y-5">

      <Card title="Selection">

        <Row
          label="Type"
          value={editor.selection?.type}
        />

        <Row
          label="Title"
          value={selection.title}
        />

        <Row
          label="Status"
          value={selection.status}
        />

      </Card>

      <Card title="Properties">

        <PropertyEditor
          item={selection}
          onSave={editor.save}
        />

      </Card>

    </div>
  );
}
