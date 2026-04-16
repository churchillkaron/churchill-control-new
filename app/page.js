import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#3a342d] text-[#f5f1e8] px-6 py-10">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold">
            <span className="text-orange-500">CC</span>{" "}
            Churchill Control System
          </h1>
          <p className="mt-2 text-[#d2c6b2]">
            Restaurant Operating System — V6 Master
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          <Link href="/control-final" className="block no-underline">
            <div className="rounded-2xl border border-[#4a443b] p-6 bg-[#1e1b17] hover:bg-[#26221d] transition">
              <h2 className="text-lg font-semibold mb-2 text-[#f5f1e8]">
                Control Panel
              </h2>
              <p className="text-sm text-[#cfc3ae]">
                Run the full service: sales, production, stock, and daily save.
              </p>
            </div>
          </Link>

          <Link href="/dashboard" className="block no-underline">
            <div className="rounded-2xl border border-[#4a443b] p-6 bg-[#1e1b17] hover:bg-[#26221d] transition">
              <h2 className="text-lg font-semibold mb-2 text-[#f5f1e8]">
                Dashboard
              </h2>
              <p className="text-sm text-[#cfc3ae]">
                Owner view: KPIs, AI manager, performance insights.
              </p>
            </div>
          </Link>

          <Link href="/history" className="block no-underline">
            <div className="rounded-2xl border border-[#4a443b] p-6 bg-[#1e1b17] hover:bg-[#26221d] transition">
              <h2 className="text-lg font-semibold mb-2 text-[#f5f1e8]">
                History
              </h2>
              <p className="text-sm text-[#cfc3ae]">
                All saved days, analytics, and performance tracking.
              </p>
            </div>
          </Link>

          <Link href="/accounting" className="block no-underline">
            <div className="rounded-2xl border border-[#4a443b] p-6 bg-[#1e1b17] hover:bg-[#26221d] transition">
              <h2 className="text-lg font-semibold mb-2 text-[#f5f1e8]">
                Accounting
              </h2>
              <p className="text-sm text-[#cfc3ae]">
                Track expenses, costs, and financial overview.
              </p>
            </div>
          </Link>

          <Link href="/payout" className="block no-underline">
            <div className="rounded-2xl border border-[#4a443b] p-6 bg-[#1e1b17] hover:bg-[#26221d] transition">
              <h2 className="text-lg font-semibold mb-2 text-[#f5f1e8]">
                Payout
              </h2>
              <p className="text-sm text-[#cfc3ae]">
                Service charge split and staff payout control.
              </p>
            </div>
          </Link>

        </div>

        {/* Footer */}
        <div className="mt-10 text-sm text-[#b5aa95]">
          System Status: V6 MASTER ACTIVE
        </div>

      </div>
    </div>
  );
}