"use client";

import "./globals.css";
import { usePathname } from "next/navigation";
import Navbar from "./Navbar";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="text-white">
        <AppWrapper>{children}</AppWrapper>
      </body>
    </html>
  );
}

function AppWrapper({ children }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";

  return (
    <div className="relative min-h-screen">

      {/* BACKGROUND IMAGE (ALL PAGES) */}
      <div
        className="fixed inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/bg-hero-control.jpg')" }}
      />

      {/* DARK OVERLAY ONLY FOR APP PAGES */}
      {!isLanding && (
        <div className="fixed inset-0 bg-black/50" />
      )}

      {/* CONTENT */}
      <div className="relative z-10">

        <Navbar />

        <main className="pt-24 px-6 max-w-7xl mx-auto">
          {children}
        </main>

      </div>
    </div>
  );
}