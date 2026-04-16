import "./globals.css";

export const metadata = {
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
        url: "/preview.jpg",
        width: 1200,
        height: 630,
      },
    ],
    locale: "en_US",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-black text-white">
        <div className="fixed top-0 left-0 w-full z-50 backdrop-blur-xl bg-[rgba(20,15,10,0.30)] border-b border-[rgba(255,200,120,0.25)]">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center">
            <div className="flex items-center gap-4">
              <span className="text-[#ff7a00] font-semibold text-2xl tracking-wider">
                CC
              </span>
              <span className="text-white text-xl tracking-wide font-light">
                Churchill
              </span>
            </div>
          </div>
        </div>

        <main className="pt-20">{children}</main>
      </body>
    </html>
  );
}