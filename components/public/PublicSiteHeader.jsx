import Image from "next/image";

function Arrow({ className = "" }) {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function PublicSiteHeader({ context, links = [], action = { label: "Login", href: "/login" } }) {
  return (
    <header className="sticky top-0 z-50 border-b border-black/[0.07] bg-[#F7F6F3]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[64px] max-w-[1460px] items-center justify-between gap-5 px-5 sm:px-7 lg:px-10">
        <a href="/" className="flex min-w-0 items-center gap-3" aria-label="Avantiqo home">
          <span className="shrink-0 rounded-xl bg-[#171716] px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,.08)]">
            <Image src="/branding/avantiqo-wordmark.png" alt="Avantiqo" width={126} height={10} className="h-[10px] w-auto object-contain" priority />
          </span>
          <span className="hidden truncate text-[7px] font-semibold uppercase tracking-[0.18em] text-[#9A744B] sm:block">{context}</span>
        </a>
        <nav className="flex items-center gap-1 sm:gap-1.5" aria-label="Primary navigation">
          {links.map((link) => (
            <a key={`${link.href}-${link.label}`} href={link.href} className={`${link.visibility || "hidden md:inline-flex"} rounded-lg px-3 py-2 text-[10px] font-medium text-[#6C6963] transition hover:bg-white hover:text-[#292723]`}>{link.label}</a>
          ))}
          <a href={action.href} className="ml-1 inline-flex h-9 shrink-0 items-center gap-2 rounded-xl bg-[#171716] px-4 text-[10px] font-semibold text-white shadow-[0_3px_10px_rgba(20,18,15,.15)] transition hover:bg-[#2A2926]">
            {action.label}<Arrow className="h-3 w-3" />
          </a>
        </nav>
      </div>
    </header>
  );
}
