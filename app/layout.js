import "./globals.css";

export const metadata = {
  title: "Churchill Control System",
  description: "Restaurant Operating System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="text-white bg-[#0d0a07]">

        {/* 🌅 GLOBAL BACKGROUND */}
        <div
          className="fixed inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/bg-beach.jpg')" }}
        />

        {/* DARK OVERLAY */}
        <div className="fixed inset-0 z-0 bg-black/70 backdrop-blur-[2px]" />

        {/* CONTENT */}
        <div className="relative z-10">
          {children}
        </div>

      </body>
    </html>
  );
}