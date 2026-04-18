import "./globals.css";

export const metadata = {
  title: "Churchill Control System",
  description: "Restaurant Operating System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="text-white bg-[#0d0a07]">

        {/* GLOBAL APP BACKGROUND (NOT landing) */}
        <div
          id="app-bg"
          className="fixed inset-0 z-0 bg-cover bg-center opacity-0 transition-opacity duration-500"
          style={{ backgroundImage: "url('/bg-beach.jpg')" }}
        />

        <div className="fixed inset-0 z-0 bg-black/70 backdrop-blur-[2px]" />

        <div className="relative z-10">
          {children}
        </div>

      </body>
    </html>
  );
}