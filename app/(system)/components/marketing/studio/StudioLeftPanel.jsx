"use client";

const goals = ["Awareness", "Promotion", "Event", "Loyalty", "Recruitment"];
const audiences = ["Tourists", "Expats", "Locals", "Hotel Guests", "Luxury"];
const directions = ["Luxury", "Elegant", "Party", "Romantic", "Family"];
const engines = ["full-ai", "enhance", "composite", "video"];

export default function StudioLeftPanel({
  poster,
  metaAccounts = [],
  organization,
}) {
  return (
    <aside className="h-full overflow-y-auto p-4 text-white">
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-[0.35em] text-[#D6B56D]">
          Design Studio
        </div>
        <div className="mt-2 text-lg font-semibold tracking-[-0.03em]">
          {organization?.name || "Active Organization"}
        </div>
        <div className="text-xs text-white/40">
          Creative strategy and brand direction
        </div>
      </div>

      <Panel title="Brand Profile">
        <Info label="Voice" value={poster?.brandVoice || "Premium"} />
        <Info label="Style" value={poster?.style || "Luxury Glass"} />
        <Info label="Venue" value={poster?.venue || organization?.name || "Venue"} />
      </Panel>

      <Panel title="Connected Accounts">
        <div className="space-y-2">
          {metaAccounts.length === 0 && (
            <div className="rounded-2xl border border-white/[0.08] bg-black/30 p-3 text-xs text-white/40">
              No Meta accounts connected.
            </div>
          )}

          {metaAccounts.map((account) => {
            const active = poster.pageId === account.page_id;

            return (
              <button
                key={account.id}
                onClick={() => poster.setPageId?.(account.page_id)}
                className={`w-full rounded-2xl border p-3 text-left transition ${
                  active
                    ? "border-[#D6B56D]/50 bg-[#D6B56D]/12"
                    : "border-white/[0.08] bg-black/30 hover:border-[#D6B56D]/30"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">
                      {account.page_name || "Meta Page"}
                    </div>
                    <div className="text-xs text-white/40">
                      Facebook + Instagram
                    </div>
                  </div>
                  <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-[#D6B56D]" : "bg-white/20"}`} />
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title="Campaign Goal">
        <PillGrid items={goals} active={poster?.campaignType} onClick={(value) => poster.setCampaignType?.(value)} />
      </Panel>

      <Panel title="Audience">
        <PillGrid items={audiences} active={poster?.audience} onClick={(value) => poster.setAudience?.(value)} />
      </Panel>

      <Panel title="Creative Direction">
        <PillGrid items={directions} active={poster?.mood} onClick={(value) => poster.setMood?.(value)} />
      </Panel>

      <Panel title="AI Engine">
        <PillGrid items={engines} active={poster?.engine || "full-ai"} onClick={(value) => poster.setEngine?.(value)} />
      </Panel>

      <Panel title="Event Details">
        <div className="space-y-2">
          <input
            value={poster.eventDate || ""}
            onChange={(e) => poster.setEventDate?.(e.target.value)}
            placeholder="Event date"
            className="w-full rounded-2xl border border-white/[0.08] bg-black/35 px-3 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#D6B56D]/40"
          />
          <input
            value={poster.eventTime || ""}
            onChange={(e) => poster.setEventTime?.(e.target.value)}
            placeholder="Event time"
            className="w-full rounded-2xl border border-white/[0.08] bg-black/35 px-3 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#D6B56D]/40"
          />
        </div>
      </Panel>
    </aside>
  );
}

function Panel({ title, children }) {
  return (
    <section className="mb-4 rounded-[24px] border border-white/[0.08] bg-white/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="mb-3 text-[10px] uppercase tracking-[0.28em] text-[#D6B56D]">
        {title}
      </div>
      {children}
    </section>
  );
}

function Info({ label, value }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3 text-xs">
      <span className="text-white/40">{label}</span>
      <span className="text-white/80">{value}</span>
    </div>
  );
}

function PillGrid({ items, active, onClick }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => {
        const selected = active === item;

        return (
          <button
            key={item}
            onClick={() => onClick?.(item)}
            className={`rounded-full border px-3 py-2 text-xs transition ${
              selected
                ? "border-[#D6B56D]/60 bg-[#D6B56D]/15 text-[#F1DFA6]"
                : "border-white/[0.08] bg-black/30 text-white/55 hover:border-[#D6B56D]/30 hover:text-white"
            }`}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}
