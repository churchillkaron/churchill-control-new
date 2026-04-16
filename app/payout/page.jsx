export default function Payout() {
  const staff = [
    { name: "FOH Team", role: "Front of House", share: "50%", amount: "6,420" },
    { name: "Bar Team", role: "Bar", share: "30%", amount: "3,852" },
    { name: "Kitchen", role: "Kitchen", share: "20%", amount: "2,568" },
  ];

  return (
    <div className="relative min-h-screen text-white overflow-hidden">

      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-30">
        <img
          src="/bg-hero-control.jpg"
          alt="Payout background"
          className="w-full h-full object-cover"
        />
      </div>

      {/* OVERLAY */}
      <div className="absolute inset-0 -z-20 bg-[linear-gradient(to_bottom,rgba(8,8,8,0.75),rgba(18,12,8,0.85))]" />

      {/* GLOW */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_20%,rgba(255,140,0,0.18),transparent_40%)]" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 pt-28 pb-14 space-y-8">

        {/* HEADER */}
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/40">
            Payout System
          </p>
          <h1 className="text-3xl md:text-5xl font-semibold mt-2">
            Service Distribution
          </h1>
          <p className="text-white/60 mt-2 max-w-xl">
            Real-time calculation of service charge and staff payout allocation.
          </p>
        </div>

        {/* HERO */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6 md:p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            <div>
              <p className="text-white/50 text-sm">Total Revenue</p>
              <h2 className="text-3xl mt-2">THB 128,450</h2>
            </div>

            <div>
              <p className="text-white/50 text-sm">Service Pool (5%)</p>
              <h2 className="text-3xl mt-2">THB 6,422</h2>
            </div>

            <div>
              <p className="text-white/50 text-sm">Status</p>
              <h2 className="text-3xl mt-2 text-[#ffb36b]">GOOD</h2>
            </div>

          </div>
        </div>

        {/* DISTRIBUTION */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6 md:p-8">

          <div className="flex justify-between mb-4">
            <h3 className="text-xl font-semibold">Team Distribution</h3>
            <p className="text-white/50 text-sm">Auto split</p>
          </div>

          <div className="space-y-4">
            {staff.map((member, i) => (
              <div
                key={i}
                className="flex justify-between items-center p-4 rounded-xl bg-black/30 border border-white/10"
              >
                <div>
                  <p className="text-sm text-white/50">Team</p>
                  <p className="text-lg font-medium">{member.name}</p>
                </div>

                <div>
                  <p className="text-sm text-white/50">Share</p>
                  <p className="text-lg">{member.share}</p>
                </div>

                <div>
                  <p className="text-sm text-white/50">Amount</p>
                  <p className="text-lg">THB {member.amount}</p>
                </div>

                <div className="text-right">
                  <p className="text-sm text-white/50">Role</p>
                  <p className="text-[#ffb36b]">{member.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* LOGIC BOX */}
        <div className="rounded-3xl border border-white/10 bg-[rgba(20,15,10,0.45)] backdrop-blur-2xl p-6 md:p-8">

          <h3 className="text-xl font-semibold mb-4">System Logic</h3>

          <div className="space-y-3 text-white/70">
            <p>• Service charge = 5% of total revenue</p>
            <p>• Status determines payout level (GOOD / WARNING / BAD)</p>
            <p>• Distribution:</p>
            <p className="ml-4">- FOH: 50%</p>
            <p className="ml-4">- Bar: 30%</p>
            <p className="ml-4">- Kitchen: 20%</p>
          </div>

        </div>

      </div>
    </div>
  );
}