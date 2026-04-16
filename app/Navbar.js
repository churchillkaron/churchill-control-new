# Churchill Control System V6 — Change 1

Replace this file completely:

`app/Navbar.js`

```javascript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Control Final", href: "/control-final" },
  { label: "POS", href: "/pos" },
  { label: "Accounting", href: "/accounting" },
  { label: "Payout", href: "/payout" },
  { label: "History", href: "/history" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setMobileOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isActive = (href) => {
    if (href === "/") return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-5 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
            <div className="absolute inset-0 bg-gradient-to-r from-[#ff7a00]/12 via-white/5 to-[#ff7a00]/8" />
            <div className="absolute -left-16 top-0 h-24 w-24 rounded-full bg-[#ff7a00]/20 blur-3xl" />
            <div className="absolute right-0 top-0 h-20 w-20 rounded-full bg-white/10 blur-3xl" />

            <div className="relative flex items-center justify-between px-4 py-3 sm:px-5 lg:px-6">
              <Link
                href="/dashboard"
                className="group flex min-w-0 items-center gap-3"
                aria-label="Go to Dashboard"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#ff7a00]/35 bg-[#ff7a00]/15 text-base font-semibold text-[#ff7a00] shadow-[0_0_25px_rgba(255,122,0,0.18)] transition duration-300 group-hover:scale-105 group-hover:bg-[#ff7a00]/20">
                  CC
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[10px] uppercase tracking-[0.35em] text-white/45">
                    Churchill
                  </p>
                  <p className="truncate text-sm font-semibold text-white sm:text-base">
                    Control System V6
                  </p>
                </div>
              </Link>

              <nav className="hidden items-center gap-2 lg:flex">
                {navItems.map((item) => {
                  const active = isActive(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`rounded-xl px-4 py-2 text-sm font-medium transition-all duration-300 ${
                        active
                          ? "border border-[#ff7a00]/45 bg-[#ff7a00]/18 text-white shadow-[0_0_30px_rgba(255,122,0,0.15)]"
                          : "border border-white/8 bg-white/5 text-white/72 hover:border-white/15 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              <button
                type="button"
                onClick={() => setMobileOpen((prev) => !prev)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/6 text-white transition hover:border-[#ff7a00]/35 hover:bg-[#ff7a00]/12 lg:hidden"
                aria-label="Toggle navigation menu"
                aria-expanded={mobileOpen}
              >
                <div className="flex flex-col gap-1.5">
                  <span
                    className={`block h-[2px] w-5 rounded-full bg-current transition ${
                      mobileOpen ? "translate-y-[7px] rotate-45" : ""
                    }`}
                  />
                  <span
                    className={`block h-[2px] w-5 rounded-full bg-current transition ${
                      mobileOpen ? "opacity-0" : "opacity-100"
                    }`}
                  />
                  <span
                    className={`block h-[2px] w-5 rounded-full bg-current transition ${
                      mobileOpen ? "-translate-y-[7px] -rotate-45" : ""
                    }`}
                  />
                </div>
              </button>
            </div>

            {mobileOpen && (
              <div className="relative border-t border-white/10 px-3 pb-3 pt-2 lg:hidden">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {navItems.map((item) => {
                    const active = isActive(item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`rounded-xl px-4 py-3 text-sm font-medium transition-all duration-300 ${
                          active
                            ? "border border-[#ff7a00]/45 bg-[#ff7a00]/18 text-white shadow-[0_0_30px_rgba(255,122,0,0.12)]"
                            : "border border-white/8 bg-white/5 text-white/78"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
```

## What this fixes now

* adds missing buttons: `POS`, `Accounting`, `Payout`
* keeps all app navigation inside `app/Navbar.js`
* restores mobile navigation with a visible toggle button
* closes mobile menu after route change
* keeps the luxury glass style instead of flat beige UI
* keeps landing page untouched because this file is only for app pages

## Push step

```bash
git add .
git commit -m "Fix navbar and mobile navigation"
git push
```

## Verify after deploy

1. Desktop navbar shows:

   * Dashboard
   * Control Final
   * POS
   * Accounting
   * Payout
   * History
2. Mobile shows hamburger button
3. Tapping hamburger opens menu
4. Buttons are visible and clickable on phone
5. Active page has orange-highlighted state
6. Landing page still has no navbar

## Important note

This navbar expects these routes to exist next:

* `/pos`
* `/accounting`
* `/payout`

So the next locked step after verification should be full file replacements for:

* `app/pos/page.js`
* `app/accounting/page.js`
* `app/payout/page.js`
