"use client";

export default function DynamicForm({
  schema = [],
  values = {},
  onChange,
}) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      {schema.map(field => (
        <div key={field.name}>
          <label className="mb-2 block text-xs uppercase tracking-[0.25em] text-white/40">
            {field.label}
          </label>

          {field.type === "textarea" ? (
            <textarea
              rows={4}
              value={values[field.name] || ""}
              onChange={e =>
                onChange(field.name, e.target.value)
              }
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
            />
          ) : (
            <input
              type={field.type || "text"}
              value={values[field.name] || ""}
              onChange={e =>
                onChange(field.name, e.target.value)
              }
              className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-white outline-none"
            />
          )}
        </div>
      ))}
    </div>
  );
}
