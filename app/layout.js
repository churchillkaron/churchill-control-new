import "./globals.css";
import { headers } from "next/headers";

export const metadata = {
  metadataBase: new URL("https://app.churchillkaron.com"),
  title: "Churchill Control System",
  description:
    "Real-time control of revenue, performance, and operations for premium hospitality venues.",
  openGraph: {
    title: "Churchill Control System",
    description: "Command your venue with real-time operational control.",
    url: "https://app.churchillkaron.com",
    siteName: "Churchill",
    images: [
      {
        url: "https://app.churchillkaron.com/preview.jpg",
        width: 1200,
        height: 630,
      },
    ],
    locale: "en_US",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  const headersList = headers();
  const pathname = headersList.get("x-pathname") || "";

  const isLanding = pathname === "/";

  return (
    <html lang="en">
      <body className="bg-black text-white">

        {/* NAVBAR ONLY ON APP PAGES */}
        {!isLanding && (
          <div className="fixed top-0 left-0 w-full z-50 backdrop-blur-xl bg-[rgba(20,15,10,0.30)] border-b border-[rgba(255,200,120,0.25)]">
            <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">

              {/* LOGO */}
              <div className="flex items-center gap-4">
                <span className="text-[#ff7a00] font-semibold text-2xl tracking-wider">
                  CC
                </span>
                <span className="text-white text-xl tracking-wide font-light">
                  Churchill
                </span>
              </div>

              {/* NAV BUTTONS */}
              <div className="hidden md:flex gap-3 text-sm">
                {["Control","Dashboard","POS","History","Accounting","Payout"].map((item) => (
                  <button
                    key={item}
                    className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition"
                  >
                    {item}
                  </button>
                ))}
              </div>

            </div>
          </div>
        )}

        {/* CONTENT */}
        <main className={!isLanding ? "pt-20" : ""}>
          {children}
        </main>

      </body>
    </html>
  );
}