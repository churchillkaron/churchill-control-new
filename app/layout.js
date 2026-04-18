import "./globals.css";

export const metadata = {
  title: "Churchill Control System",
  description: "Restaurant Operating System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="text-white">

        {/* 🌅 GLOBAL BACKGROUND */}
        <div
          className="fixed inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/bg-beach.jpg')" }}
        />

        {/* DARK OVERLAY */}
        <div className="fixed inset-0 z-0 bg-black/60" />

        {/* CONTENT */}
        <div className="relative z-10">
          {children}
        </div>

      </body>
    </html>
  );
}