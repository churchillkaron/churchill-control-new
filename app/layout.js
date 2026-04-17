import "./globals.css";

export const metadata = {
  title: "Churchill Control System",
  description: "Premium Restaurant Operating System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="relative text-white">

        {/* 🌅 BACKGROUND SYSTEM */}
        <Background />

        {/* CONTENT */}
        <div className="relative z-10">
          {children}
        </div>

      </body>
    </html>
  );
}


// 🔥 GLOBAL BACKGROUND CONTROLLER
function Background() {
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "/";

  const isLanding = pathname === "/";

  return (
    <div className="fixed inset-0 -z-10">

      {/* IMAGE */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-all duration-700"
        style={{
          backgroundImage: isLanding
            ? "url('/bg-hero-control.jpg')" // LANDING
            : "url('/bg-beach.jpg')"       // APP
        }}
      />

      {/* 🎯 GLOBAL OVERLAY (KEY TO PREMIUM LOOK) */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/70 to-black/90" />

      {/* 🌟 SUBTLE GLOW (luxury depth) */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,122,0,0.12),transparent_40%)]" />

    </div>
  );
}