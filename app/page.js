import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white px-6 py-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-bold">
            <span className="text-orange-500">CC</span>{" "}
            Churchill Control System
          </h1>
          <p className="text-white/60 mt-2">
            Restaurant Operating System — V6 Master
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          <Link href="/control-final" className="block !text-white no-underline">
            <div className="rounded-2xl border border-white/10 p-6 bg-[#0b0b0b] hover:bg-white/5 transition cursor-pointer">
              <h2 className="!text-white text-lg font-semibold mb-2">Control Panel</h2>
              <p className="text-white/60 text-sm">
                Run the full service: sales, production, stock, and daily save.
              </p>
            </div>
          </Link>

          <Link href="/dashboard" className="block !text-white no-underline">
            <div className="rounded-2xl border border-white/10 p-6 bg-[#0b0b0b] hover:bg-white/5 transition cursor-pointer">
              <h2 className="!text-white text-lg font-semibold mb-2">Dashboard</h2>
              <p className="text-white/60 text-sm">
                Owner view: KPIs, AI manager, performance insights.
              </p>
            </div>
          </Link>

          <Link href="/history" className="block !text-white no-underline">
            <div className="rounded-2xl border border-white/10 p-6 bg-[#0b0b0b] hover:bg-white/5 transition cursor-pointer">
              <h2 className="!text-white text-lg font-semibold mb-2">History</h2>
              <p className="text-white/60 text-sm">
                All saved days, analytics, and performance tracking.
              </p>
            </div>
          </Link>

          <Link href="/accounting" className="block !text-white no-underline">
            <div className="rounded-2xl border border-white/10 p-6 bg-[#0b0b0b] hover:bg-white/5 transition cursor-pointer">
              <h2 className="!text-white text-lg font-semibold mb-2">Accounting</h2>
              <p className="text-white/60 text-sm">
                Track expenses, costs, and financial overview.
              </p>
            </div>
          </Link>

          <Link href="/payout" className="block !text-white no-underline">
            <div className="rounded-2xl border border-white/10 p-6 bg-[#0b0b0b] hover:bg-white/5 transition cursor-pointer">
              <h2 className="!text-white text-lg font-semibold mb-2">Payout</h2>
              <p className="text-white/60 text-sm">
                Service charge split and staff payout control.
              </p>
            </div>
          </Link>

        </div>

        <div className="mt-10 text-sm text-white/40">
          System Status: V6 MASTER ACTIVE
        </div>
      </div>
    </div>
  );
}