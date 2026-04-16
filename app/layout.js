import "./globals.css";

export const metadata = {
  title: "Churchill Control System",
  description:
    "Luxury hospitality control system for restaurants, beach clubs and premium venues.",
  openGraph: {
    title: "Churchill Control System",
    description:
      "Luxury hospitality control system for restaurants, beach clubs and premium venues.",
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

        {/* NAVBAR */}
        <div className="fixed top-0 left-0 w-full z-50 backdrop-blur-xl bg-[rgba(20,15,10,0.30)] border-b border-[rgba(255,200,120,0.25)]">

          <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">

            {/* LOGO */}
            <div className="flex items-center gap-2">
              <span className="text-[#ff7a00] font-bold text-xl">CC</span>
              <span className="text-white/90 font-medium">Churchill</span>
            </div>

            {/* NAV */}
            <div className="hidden md:flex gap-2 text-sm">

              {["Home","Control","Dashboard","POS","History","Accounting","Payout"].map((item) => (
                <button
                  key={item}
                  className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition"
                >
                  {item}
                </button>
              ))}

            </div>

          </div>
        </div>

        {/* PAGE */}
        <main className="pt-16">{children}</main>

      </body>
    </html>
  );
}