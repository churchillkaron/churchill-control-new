import "./globals.css";

export const metadata = {
  title: "Churchill Control System",
  description: "Luxury hospitality control system for restaurants, beach clubs and premium venues.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-[#e6dcc7]">

        {/* NAVBAR */}
        <div className="fixed top-0 left-0 w-full z-50 backdrop-blur-md bg-[rgba(20,15,10,0.35)] border-b border-[rgba(255,200,120,0.2)]">

          <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between text-white">

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

        {/* CONTENT */}
        <main className="pt-16">
          {children}
        </main>

      </body>
    </html>
  );
}