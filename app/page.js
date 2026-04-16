import Link from "next/link";

export default function Home() {
  return (
    <div>

      <div className="mb-10">
        <h1 className="text-3xl font-bold">
          <span className="text-orange-500">CC</span> Churchill Control System
        </h1>
        <p className="text-[#6b6458] mt-2">
          Restaurant Operating System — V6 Master
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {[
          { title: "Control Panel", href: "/control-final", desc: "Run the full service: sales, production, stock, and daily save." },
          { title: "Dashboard", href: "/dashboard", desc: "Owner view: KPIs, AI manager, performance insights." },
          { title: "History", href: "/history", desc: "All saved days, analytics, and performance tracking." },
          { title: "Accounting", href: "/accounting", desc: "Track expenses, costs, and financial overview." },
          { title: "Payout", href: "/payout", desc: "Service charge split and staff payout control." },
        ].map((item) => (
          <Link key={item.href} href={item.href}>
            <div className="rounded-2xl border border-[#a89f84] bg-[#f3ead7] p-6 shadow-sm hover:shadow-md transition cursor-pointer">

              <h2 className="text-[#2f2a24] text-lg font-semibold mb-2">
                {item.title}
              </h2>

              <p className="text-[#6b6458] text-sm">
                {item.desc}
              </p>

            </div>
          </Link>
        ))}

      </div>

      <div className="mt-10 text-sm text-[#6b6458]">
        System Status: V6 MASTER ACTIVE
      </div>

    </div>
  );
}