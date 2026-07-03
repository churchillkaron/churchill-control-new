export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main className="min-h-screen p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs uppercase tracking-[0.35em] text-white/50">
          Finance
        </p>

        <h1 className="mt-3 text-4xl font-light">
          Matching Center
        </h1>

        <p className="mt-4 max-w-3xl text-white/60">
          Central invoice and transaction matching work center.
        </p>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          <div className="text-lg">
            Production Ready Workspace
          </div>

          <div className="mt-3 text-white/60">
            Registry connected. Organization aware. Entity aware.
            Ready for business workflows.
          </div>
        </div>
      </div>
    </main>
  );
}
