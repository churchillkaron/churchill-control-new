"use client";

import "./globals.css";
import Navbar from "./Navbar";
import { usePathname } from "next/navigation";

export default function RootLayout({ children }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";

  return (
    <html lang="en">
      <body className="text-white">

        {/* ✅ GLOBAL BACKGROUND */}
        <div
          className="fixed inset-0 bg-cover bg-center bg-no-repeat -z-20"
          style={{
            backgroundImage: isLanding
              ? "url('/bg-beach.jpg')"        // LANDING
              : "url('/bg-hero-control.jpg')" // APP
          }}
        />

        {/* ✅ DARK OVERLAY (luxury depth) */}
        <div className="fixed inset-0 bg-black/50 -z-10" />

        {/* ✅ NAVBAR ONLY IN APP */}
        {!isLanding && <Navbar />}

        <main className={!isLanding ? "pt-20" : ""}>
          {children}
        </main>

      </body>
    </html>
  );
}