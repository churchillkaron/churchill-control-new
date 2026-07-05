export default function Header({
  runtime,
}) {

  return (

    <header className="border-b border-white/10 bg-[#0d111b]">

      <div className="flex items-center justify-between px-8 py-5">

        <div>

          <div className="text-xs uppercase tracking-[0.3em] text-cyan-300">
            Creative Production Studio
          </div>

          <h1 className="mt-2 text-3xl font-semibold">
            {runtime.workspace.title}
          </h1>

        </div>

        <div className="flex gap-3">

          {runtime.commands.map(command => (

            <button
              key={command.id}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 hover:bg-white/10"
            >
              {command.label}
            </button>

          ))}

        </div>

      </div>

    </header>

  );

}
