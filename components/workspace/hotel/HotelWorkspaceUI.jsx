"use client";

import Link from "next/link";

export const HOTEL_WORKSPACE_NAV = Object.freeze([
  { id: "control", label: "Hotel Control", route: "hotel" },
  { id: "front-desk", label: "Front Desk", route: "front-desk" },
  { id: "reservations", label: "Reservations", route: "reservations" },
  { id: "channels", label: "Channels & Rates", route: "channel-manager" },
  { id: "housekeeping", label: "Housekeeping", route: "housekeeping" },
  { id: "maintenance", label: "Maintenance", route: "maintenance" },
  { id: "concierge", label: "Guest Requests", route: "concierge" },
  { id: "configuration", label: "Hotel Setup", route: "hotel-setup" },
]);

function clean(value) {
  return String(value ?? "").trim();
}

export function hotelWorkspaceHref(organizationId, route) {
  const organization = encodeURIComponent(clean(organizationId));
  return `/workspace/${organization}/operations/${clean(route).replace(/^\/+/, "")}`;
}

export function titleCase(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function HotelWorkspaceShell({
  organizationId,
  active,
  eyebrow = "Hotel operations",
  title,
  subtitle,
  context = null,
  actions = null,
  children,
}) {
  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F7F6F3] px-4 py-5 text-[#2A2723] md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1720px] space-y-4">
        <section className="overflow-hidden rounded-[22px] border border-black/[0.07] bg-[#FBF8F3]">
          <div className="flex flex-col gap-3 px-4 py-4 md:px-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.15em] text-[#8A633C]">
                <span>{eyebrow}</span>
                {context ? (
                  <span className="rounded-full border border-[#A37849]/18 bg-white px-2 py-1 tracking-[0.06em] text-[#76583A]">
                    {context}
                  </span>
                ) : null}
              </div>
              <h1 className="mt-1.5 text-[22px] font-semibold tracking-[-0.03em] text-[#2A2723]">{title}</h1>
              {subtitle ? <p className="mt-1.5 max-w-4xl text-[9px] leading-4 text-[#817B73]">{subtitle}</p> : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">{actions}</div> : null}
          </div>

          <nav className="flex gap-1 overflow-x-auto border-t border-black/[0.06] bg-white/55 px-3 py-2" aria-label="Hotel operations">
            {HOTEL_WORKSPACE_NAV.map((item) => {
              const selected = item.id === active;
              return (
                <Link
                  key={item.id}
                  href={hotelWorkspaceHref(organizationId, item.route)}
                  className={selected
                    ? "shrink-0 rounded-lg bg-[#25231F] px-2.5 py-1.5 text-[8px] font-semibold text-white"
                    : "shrink-0 rounded-lg px-2.5 py-1.5 text-[8px] font-semibold text-[#746E66] transition hover:bg-white hover:text-[#76583A]"}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </section>

        {children}
      </div>
    </main>
  );
}

export function HotelPrimaryAction({ href, onClick, disabled = false, children, type = "button" }) {
  const className = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#25231F] px-3 text-[8px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-45";
  if (href) return <Link href={href} className={className}>{children}</Link>;
  return <button type={type} onClick={onClick} disabled={disabled} className={className}>{children}</button>;
}

export function HotelSecondaryAction({ href, onClick, disabled = false, children, type = "button" }) {
  const className = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 text-[8px] font-semibold text-[#716B63] transition hover:border-[#A37849]/25 hover:text-[#76583A] disabled:cursor-not-allowed disabled:opacity-45";
  if (href) return <Link href={href} className={className}>{children}</Link>;
  return <button type={type} onClick={onClick} disabled={disabled} className={className}>{children}</button>;
}

export function HotelMetric({ label, value, detail, attention = false, href = null }) {
  const content = (
    <>
      <div className="text-[7px] font-semibold uppercase tracking-[0.12em] text-[#8D877F]">{label}</div>
      <div className={`mt-1.5 text-[21px] font-semibold tracking-[-0.035em] tabular-nums ${attention ? "text-[#9A533D]" : "text-[#2F2B27]"}`}>{value}</div>
      <div className="mt-0.5 text-[8px] leading-4 text-[#918B83]">{detail}</div>
    </>
  );

  const className = "rounded-2xl border border-black/[0.07] bg-white px-3.5 py-3 transition";
  return href ? (
    <Link href={href} className={`${className} hover:border-[#A37849]/20 hover:bg-[#FCFAF6]`}>{content}</Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function HotelSection({ eyebrow, title, detail = null, action = null, children, className = "" }) {
  return (
    <section className={`overflow-hidden rounded-[22px] border border-black/[0.07] bg-white ${className}`.trim()}>
      <div className="flex flex-col gap-2 border-b border-black/[0.06] px-4 py-3.5 md:flex-row md:items-start md:justify-between md:px-5">
        <div>
          {eyebrow ? <div className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#8A867F]">{eyebrow}</div> : null}
          <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-[#34302B]">{title}</h2>
          {detail ? <p className="mt-0.5 text-[8px] leading-4 text-[#918B83]">{detail}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function HotelStatusPill({ value, tone = null }) {
  const normalized = clean(value).toUpperCase();
  const inferred = tone || (
    ["COMPLETED", "CHECKED_IN", "AVAILABLE", "READY", "INSPECTED"].includes(normalized)
      ? "good"
      : ["PENDING", "DIRTY", "DUE", "RESERVED"].includes(normalized)
        ? "warning"
        : ["OUT_OF_SERVICE", "BLOCKED", "CANCELLED", "OVERDUE"].includes(normalized)
          ? "critical"
          : "neutral"
  );
  const classes = {
    good: "border-emerald-700/10 bg-emerald-50 text-emerald-800",
    warning: "border-amber-700/15 bg-amber-50 text-amber-800",
    critical: "border-red-700/15 bg-red-50 text-red-800",
    neutral: "border-black/[0.07] bg-[#F7F6F3] text-[#716B63]",
  };
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.05em] ${classes[inferred] || classes.neutral}`}>
      {titleCase(normalized || "unknown")}
    </span>
  );
}

export function HotelEmptyState({ children }) {
  return <div className="px-5 py-8 text-center text-[9px] text-[#918B83]">{children}</div>;
}

export function HotelError({ children }) {
  if (!children) return null;
  return <div className="rounded-2xl border border-red-700/15 bg-red-50 px-4 py-3 text-[9px] text-red-800">{children}</div>;
}

export function HotelSuccess({ children }) {
  if (!children) return null;
  return <div className="rounded-2xl border border-emerald-700/10 bg-emerald-50 px-4 py-3 text-[9px] text-emerald-800">{children}</div>;
}

export function HotelField({ label, children, hint = null }) {
  return (
    <label className="block">
      <span className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[#8D877F]">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint ? <span className="mt-1 block text-[7px] leading-3 text-[#A09A92]">{hint}</span> : null}
    </label>
  );
}

export const hotelInputClass = "h-9 w-full rounded-lg border border-black/[0.09] bg-white px-2.5 text-[9px] text-[#3F3A35] outline-none transition placeholder:text-[#A39D95] focus:border-[#A37849]/45 focus:ring-2 focus:ring-[#A37849]/10";
export const hotelTextareaClass = "min-h-20 w-full resize-y rounded-lg border border-black/[0.09] bg-white px-2.5 py-2 text-[9px] leading-4 text-[#3F3A35] outline-none transition placeholder:text-[#A39D95] focus:border-[#A37849]/45 focus:ring-2 focus:ring-[#A37849]/10";
